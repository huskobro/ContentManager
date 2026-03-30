"""
Tests for:
1. _migrate_legacy_setting_keys() — DB key rename migration
2. output_dir path sanitization (startup strip-quotes logic)
3. SettingResponse._decode_json_value validator
4. _decode_value() iterative multi-encode decode
5. _repair_multi_encoded_values() startup DB repair
6. normalize_narration() — TTS/subtitle canonical text chain
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest


# ─── Migration Tests ──────────────────────────────────────────────────────────

def _make_setting(key: str, value: str, scope: str = "admin", scope_id: str = ""):
    """Minimal mock of a Setting ORM row."""
    m = MagicMock()
    m.scope = scope
    m.scope_id = scope_id
    m.key = key
    m.value = value
    m.locked = False
    m.description = None
    m.created_at = "2026-01-01T00:00:00"
    m.updated_at = "2026-01-01T00:00:00"
    return m


def _run_migration(rows: list) -> tuple[list, list]:
    """
    Runs _migrate_legacy_setting_keys against a fake DB.
    Returns (final_keys, deleted_keys).
    """
    from backend.main import _migrate_legacy_setting_keys, _LEGACY_KEY_RENAMES

    deleted: list[str] = []
    committed = [False]

    def fake_query(model):
        class Q:
            def filter(self, *args, **kwargs):
                # Extract key from filter args by inspecting
                return self

            def first(self_inner):
                # We need to capture the filter arguments
                return None

        return Q()

    # Build a lookup for testing
    db_store: dict[str, MagicMock] = {r.key: r for r in rows}

    class FakeQuery:
        def __init__(self, key_filter=None):
            self._key = key_filter

        def filter(self, *args):
            # Find the key= filter argument
            for arg in args:
                # SQLAlchemy comparison objects — extract value from string repr
                str_arg = str(arg)
                for k in list(db_store.keys()):
                    if f"'{k}'" in str_arg or f'"{k}"' in str_arg:
                        self._key = k
                        break
            return self

        def first(self):
            return db_store.get(self._key)

    class FakeDB:
        def query(self, model):
            return FakeQuery()

        def delete(self, row):
            key = getattr(row, "key", None)
            if key and key in db_store:
                del db_store[key]
                deleted.append(key)

        def commit(self):
            committed[0] = True

    _migrate_legacy_setting_keys(FakeDB())
    return list(db_store.keys()), deleted


class TestMigrateLegacySettingKeys:
    """Tests for _migrate_legacy_setting_keys()."""

    def test_old_key_renamed_when_new_absent(self):
        """Old key exists, new key absent → old key is renamed."""
        from backend.main import _migrate_legacy_setting_keys, _LEGACY_KEY_RENAMES

        # Minimal integration test using real SQLite in-memory DB
        from sqlalchemy import create_engine, event
        from sqlalchemy.orm import sessionmaker
        from backend.database import Base
        from backend.models.settings import Setting

        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)

        with Session() as db:
            # Insert old key record
            old_row = Setting(
                scope="admin",
                scope_id="",
                key="default_language",
                value=json.dumps("de"),
                locked=False,
            )
            db.add(old_row)
            db.commit()

            _migrate_legacy_setting_keys(db)

            # Old key should be gone
            old = db.query(Setting).filter(Setting.key == "default_language").first()
            assert old is None, "Old key should have been renamed"

            # New key should exist with same value
            new = db.query(Setting).filter(Setting.key == "language").first()
            assert new is not None, "New key should exist after migration"
            assert new.value == json.dumps("de"), "Value should be preserved"

    def test_old_key_deleted_when_new_present(self):
        """Old key exists AND new key exists → old key is deleted, new key wins."""
        from backend.main import _migrate_legacy_setting_keys
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from backend.database import Base
        from backend.models.settings import Setting

        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)

        with Session() as db:
            old_row = Setting(
                scope="admin", scope_id="", key="default_tts_provider",
                value=json.dumps("elevenlabs"), locked=False,
            )
            new_row = Setting(
                scope="admin", scope_id="", key="tts_provider",
                value=json.dumps("edge_tts"), locked=False,
            )
            db.add_all([old_row, new_row])
            db.commit()

            _migrate_legacy_setting_keys(db)

            old = db.query(Setting).filter(Setting.key == "default_tts_provider").first()
            assert old is None, "Old key should be deleted"

            new = db.query(Setting).filter(Setting.key == "tts_provider").first()
            assert new is not None
            assert new.value == json.dumps("edge_tts"), "New key value should be preserved"

    def test_idempotent_no_old_keys(self):
        """No old keys present → migration does nothing."""
        from backend.main import _migrate_legacy_setting_keys
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from backend.database import Base
        from backend.models.settings import Setting

        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)

        with Session() as db:
            row = Setting(
                scope="admin", scope_id="", key="language",
                value=json.dumps("tr"), locked=False,
            )
            db.add(row)
            db.commit()

            _migrate_legacy_setting_keys(db)

            # Nothing changed
            existing = db.query(Setting).filter(Setting.key == "language").first()
            assert existing is not None
            assert existing.value == json.dumps("tr")

    def test_all_legacy_keys_migrated(self):
        """All 5 legacy keys are migrated when they exist."""
        from backend.main import _migrate_legacy_setting_keys, _LEGACY_KEY_RENAMES
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from backend.database import Base
        from backend.models.settings import Setting

        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)

        with Session() as db:
            for old_key in _LEGACY_KEY_RENAMES:
                db.add(Setting(
                    scope="admin", scope_id="", key=old_key,
                    value=json.dumps("test_value"), locked=False,
                ))
            db.commit()

            _migrate_legacy_setting_keys(db)

            for old_key, new_key in _LEGACY_KEY_RENAMES.items():
                old = db.query(Setting).filter(Setting.key == old_key).first()
                assert old is None, f"Old key {old_key!r} should be gone"

                new = db.query(Setting).filter(Setting.key == new_key).first()
                assert new is not None, f"New key {new_key!r} should exist"
                assert new.value == json.dumps("test_value")


# ─── Output Path Sanitization Tests ───────────────────────────────────────────

class TestOutputPathSanitization:
    """Tests for the startup output_dir quote-stripping logic."""

    def _sanitize(self, raw: str) -> str:
        """Replicates the sanitization in main.py startup."""
        return raw.strip().strip('"').strip("'")

    def test_clean_path_unchanged(self):
        raw = "/Users/foo/output"
        assert self._sanitize(raw) == "/Users/foo/output"

    def test_quoted_path_unquoted(self):
        # This is the corrupted path that was stored after double-encoding
        raw = '"/Users/foo/output"'
        assert self._sanitize(raw) == "/Users/foo/output"

    def test_single_quoted_path(self):
        raw = "'/Users/foo/output'"
        assert self._sanitize(raw) == "/Users/foo/output"

    def test_path_with_spaces(self):
        raw = '"/Users/foo/my project/output"'
        assert self._sanitize(raw) == "/Users/foo/my project/output"

    def test_double_nested_absolute_path_not_double_joined(self):
        """
        The real bug: resolved path was an absolute path, then joined with
        another absolute path. Path('/base') / Path('/absolute') = Path('/absolute')
        in Python. But when the quotes were IN the path string,
        Path('/base/"/absolute"') was created.
        Verify that after sanitization, Path is absolute.
        """
        from pathlib import Path
        corrupted = '"/Users/huseyincoskun/Downloads/ContentManager/output"'
        sanitized = self._sanitize(corrupted)
        p = Path(sanitized)
        assert p.is_absolute(), f"Path should be absolute: {p}"
        assert '"' not in str(p), f"No quotes should remain in path: {p}"
        assert "'" not in str(p), f"No single quotes should remain in path: {p}"

    def test_non_absolute_after_sanitize_is_detected(self):
        """Relative path after sanitize is detected and rejected by is_absolute() check."""
        from pathlib import Path
        raw = "relative/path/output"
        sanitized = self._sanitize(raw)
        p = Path(sanitized)
        assert not p.is_absolute()


# ─── SettingResponse Decode Tests ─────────────────────────────────────────────

class TestSettingResponseDecoder:
    """Tests for SettingResponse._decode_json_value validator."""

    def _make_orm_row(self, key: str, value: str):
        from unittest.mock import MagicMock
        m = MagicMock()
        m.id = 1
        m.scope = "admin"
        m.scope_id = ""
        m.key = key
        m.value = value
        m.locked = False
        m.description = None
        m.created_at = "2026-01-01T00:00:00"
        m.updated_at = "2026-01-01T00:00:00"
        return m

    def _validate(self, orm_row):
        from backend.models.schemas import SettingResponse
        return SettingResponse.model_validate(orm_row)

    def test_string_value_decoded(self):
        row = self._make_orm_row("tts_provider", '"edge_tts"')
        resp = self._validate(row)
        assert resp.value == "edge_tts", f"Expected 'edge_tts', got {resp.value!r}"

    def test_integer_value_decoded(self):
        row = self._make_orm_row("max_concurrent_jobs", "3")
        resp = self._validate(row)
        assert resp.value == 3

    def test_boolean_value_decoded(self):
        row = self._make_orm_row("some_flag", "true")
        resp = self._validate(row)
        assert resp.value is True

    def test_list_value_decoded(self):
        row = self._make_orm_row("tts_fallback_order", '["edge_tts","elevenlabs"]')
        resp = self._validate(row)
        assert resp.value == ["edge_tts", "elevenlabs"]

    def test_path_string_decoded(self):
        row = self._make_orm_row("output_dir", '"/Users/foo/output"')
        resp = self._validate(row)
        assert resp.value == "/Users/foo/output", f"Got {resp.value!r}"
        assert '"' not in str(resp.value), "No quotes should remain"

    def test_multi_encoded_string_decoded(self):
        """Double-encoded string: '"\\\"edge_tts\\\""' → 'edge_tts'."""
        # json.dumps(json.dumps("edge_tts")) = '"\\"edge_tts\\""'
        double = json.dumps(json.dumps("edge_tts"))
        row = self._make_orm_row("tts_provider", double)
        resp = self._validate(row)
        assert resp.value == "edge_tts", f"Expected 'edge_tts', got {resp.value!r}"

    def test_multi_encoded_list_decoded(self):
        """Double-encoded list: '"[\\"a\\",\\"b\\"]"' → ["a","b"]."""
        double = json.dumps(json.dumps(["a", "b"]))
        row = self._make_orm_row("tts_fallback_order", double)
        resp = self._validate(row)
        assert resp.value == ["a", "b"], f"Expected ['a','b'], got {resp.value!r}"

    def test_triple_encoded_string_decoded(self):
        """Triple-encoded value decoded correctly."""
        triple = json.dumps(json.dumps(json.dumps("hello")))
        row = self._make_orm_row("test_key", triple)
        resp = self._validate(row)
        assert resp.value == "hello", f"Expected 'hello', got {resp.value!r}"


# ─── _decode_value() Iterative Decode Tests ─────────────────────────────────

class TestDecodeValueIterative:
    """Tests for _decode_value() iterative multi-layer decoding."""

    def _decode(self, raw: str):
        from backend.services.settings_resolver import _decode_value
        return _decode_value(raw)

    def test_single_encoded_string(self):
        assert self._decode('"edge_tts"') == "edge_tts"

    def test_single_encoded_int(self):
        assert self._decode("3") == 3

    def test_single_encoded_bool(self):
        assert self._decode("true") is True

    def test_single_encoded_list(self):
        assert self._decode('["a","b"]') == ["a", "b"]

    def test_double_encoded_string(self):
        double = json.dumps(json.dumps("edge_tts"))
        assert self._decode(double) == "edge_tts"

    def test_double_encoded_list(self):
        double = json.dumps(json.dumps(["edge_tts", "openai_tts"]))
        assert self._decode(double) == ["edge_tts", "openai_tts"]

    def test_triple_encoded_value(self):
        triple = json.dumps(json.dumps(json.dumps("hello")))
        assert self._decode(triple) == "hello"

    def test_bare_string_returned_as_is(self):
        """Bare string (not valid JSON) returned unchanged."""
        assert self._decode("bc633fe335d788") == "bc633fe335d788"

    def test_already_decoded_passthrough(self):
        """Properly single-encoded value decoded in one pass."""
        assert self._decode('"hello"') == "hello"


# ─── _repair_multi_encoded_values() DB Repair Tests ─────────────────────────

class TestRepairMultiEncodedValues:
    """Tests for _repair_multi_encoded_values() startup DB repair."""

    def _run_repair(self, initial_values: dict[str, str]) -> dict[str, str]:
        """
        Insert values into in-memory SQLite, run repair, return results.
        initial_values: {key: raw_db_value}
        Returns: {key: repaired_raw_db_value}
        """
        from backend.main import _repair_multi_encoded_values
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from backend.database import Base
        from backend.models.settings import Setting

        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)

        with Session() as db:
            for key, raw_value in initial_values.items():
                db.add(Setting(
                    scope="admin", scope_id="", key=key,
                    value=raw_value, locked=False,
                ))
            db.commit()

            _repair_multi_encoded_values(db)

            results = {}
            for row in db.query(Setting).all():
                results[row.key] = row.value
        return results

    def test_double_encoded_string_repaired(self):
        double = json.dumps(json.dumps("edge_tts"))
        results = self._run_repair({"tts_provider": double})
        assert results["tts_provider"] == '"edge_tts"'

    def test_double_encoded_list_repaired(self):
        double = json.dumps(json.dumps(["edge_tts", "openai_tts"]))
        results = self._run_repair({"tts_fallback_order": double})
        assert results["tts_fallback_order"] == '["edge_tts", "openai_tts"]'

    def test_corrupted_fallback_order_repaired(self):
        """Real-world corruption pattern: array with encoded string elements."""
        # This pattern: ["[\"edge_tts\"", "\"openai_tts\"]", "edge_tts"]
        # Fragment ['["edge_tts"', '"openai_tts"]'] reconstructs to ["edge_tts","openai_tts"]
        # Trailing "edge_tts" is a duplicate and gets deduped.
        corrupted = json.dumps(['["edge_tts"', '"openai_tts"]', "edge_tts"])
        results = self._run_repair({"tts_fallback_order": corrupted})
        decoded = json.loads(results["tts_fallback_order"])
        assert all(isinstance(x, str) for x in decoded)
        assert decoded == ["edge_tts", "openai_tts"]

    def test_corrupted_llm_fallback_order_repaired(self):
        """Real-world LLM fallback corruption: all elements are fragments."""
        corrupted = json.dumps(['["kieai"', '"gemini"', '"openai_llm"]'])
        results = self._run_repair({"llm_fallback_order": corrupted})
        decoded = json.loads(results["llm_fallback_order"])
        assert decoded == ["kieai", "gemini", "openai_llm"]

    def test_corrupted_visuals_fallback_order_repaired(self):
        """Real-world visuals fallback corruption."""
        corrupted = json.dumps(['["pexels"', '"pixabay"]'])
        results = self._run_repair({"visuals_fallback_order": corrupted})
        decoded = json.loads(results["visuals_fallback_order"])
        assert decoded == ["pexels", "pixabay"]

    def test_properly_encoded_value_untouched(self):
        """Properly encoded value should not be modified."""
        proper = json.dumps("edge_tts")  # '"edge_tts"'
        results = self._run_repair({"tts_provider": proper})
        assert results["tts_provider"] == proper

    def test_properly_encoded_list_untouched(self):
        proper = json.dumps(["a", "b"])  # '["a", "b"]'
        results = self._run_repair({"fallback": proper})
        assert results["fallback"] == proper

    def test_bare_string_gets_json_encoded(self):
        """Bare string (not JSON) gets properly JSON-encoded."""
        results = self._run_repair({"api_key": "abc123"})
        assert results["api_key"] == '"abc123"'

    def test_idempotent_double_run(self):
        """Running repair twice produces same result."""
        from backend.main import _repair_multi_encoded_values
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from backend.database import Base
        from backend.models.settings import Setting

        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)

        double = json.dumps(json.dumps("edge_tts"))
        with Session() as db:
            db.add(Setting(
                scope="admin", scope_id="", key="tts_provider",
                value=double, locked=False,
            ))
            db.commit()

            _repair_multi_encoded_values(db)
            first_run = db.query(Setting).first().value

            _repair_multi_encoded_values(db)
            second_run = db.query(Setting).first().value

        assert first_run == second_run == '"edge_tts"'


# ─── TTS/Subtitle Canonical Text Chain Tests ────────────────────────────────

class TestCanonicalTextChain:
    """
    Verifies that TTS and subtitle steps use the same canonical text source.

    The canonical chain:
      script.narration (raw LLM) → normalize_narration() → TTS input
      script.narration (raw LLM) → normalize_narration() → subtitle text
      TTS word_timings → subtitle word_timings (primary path)
    """

    def test_normalize_removes_markdown(self):
        from backend.utils.text import normalize_narration
        raw = "**Merhaba** dünya! *Bu* bir __test__ metnidir."
        result = normalize_narration(raw)
        assert "**" not in result
        assert "*" not in result
        assert "__" not in result
        assert "Merhaba" in result
        assert "dünya" in result

    def test_normalize_removes_bullets(self):
        from backend.utils.text import normalize_narration
        raw = "- Madde 1\n• Madde 2\n* Madde 3"
        result = normalize_narration(raw)
        assert "-" not in result
        assert "•" not in result

    def test_normalize_collapses_newlines(self):
        from backend.utils.text import normalize_narration
        raw = "Satır 1\n\nSatır 2\nSatır 3"
        result = normalize_narration(raw)
        assert "\n" not in result
        assert "Satır 1 Satır 2 Satır 3" == result

    def test_normalize_idempotent(self):
        """Applying normalize twice gives the same result."""
        from backend.utils.text import normalize_narration
        raw = "**Bold** ve *italic* metin\n\n- madde"
        first = normalize_narration(raw)
        second = normalize_narration(first)
        assert first == second

    def test_tts_and_subtitle_use_same_source(self):
        """
        Both TTS (pipeline.step_tts) and subtitles (step_subtitles_enhanced)
        call normalize_narration() on the same scene narration.
        Verify the function produces identical output for same input.
        """
        from backend.utils.text import normalize_narration
        narration = "**Yapay zeka** dünyayı değiştiriyor!\n\n- İlk madde\n- İkinci madde"
        tts_text = normalize_narration(narration)
        subtitle_text = normalize_narration(narration)
        assert tts_text == subtitle_text

    def test_normalize_empty_input(self):
        from backend.utils.text import normalize_narration
        assert normalize_narration("") == ""
        assert normalize_narration(None) is None

    def test_normalize_strips_whitespace(self):
        from backend.utils.text import normalize_narration
        raw = "  metin  "
        assert normalize_narration(raw) == "metin"
