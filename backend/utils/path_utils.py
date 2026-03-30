"""
Path Utilities — Path validation ve manipulation helpers.

Merkezi path işlemleri, validasyon, güvenlik kontrolleri.
"""

from __future__ import annotations

from pathlib import Path
from fastapi import HTTPException


def validate_output_path(path_str: str) -> Path:
    """
    Output klasörü için path'i validate et, resolve et, oluştur.

    Yapılan kontrolller:
      1. Path resolve et (relative → absolute)
      2. Sistem kritik dizinlerine gitmediğini kontrol et
      3. Klasörü oluştur
      4. Yazılabilir olduğunu doğrula

    Args:
        path_str: Klasör yolu (mutlak veya göreceli)

    Returns:
        Validated absolute Path

    Raises:
        HTTPException: Path geçersiz, sistem kritik dizinde, veya yazılamıyor
    """
    if not path_str or not path_str.strip():
        raise HTTPException(
            status_code=400,
            detail="Klasör yolu boş olamaz.",
        )

    try:
        output_path = Path(path_str).resolve()

        # ── Güvenlik: Path traversal saldırılarına karşı kontrol ─────────────────

        forbidden_paths = [
            Path("/etc"),
            Path("/sys"),
            Path("/proc"),
            Path("/root"),
            Path("/var/lib"),
            Path("/var/log"),
            Path("/private/etc"),    # macOS
            Path("/private/var"),    # macOS
        ]

        for forbidden in forbidden_paths:
            try:
                output_path.relative_to(forbidden)
                # Eğer buraya geldiyse, output_path forbidden'in altında demek
                raise HTTPException(
                    status_code=400,
                    detail=f"Output klasörü sistem kritik dizinlerine konulamaz: {forbidden}",
                )
            except ValueError:
                # relative_to başarısız → output_path bu forbidden path'in altında değil (iyi!)
                pass

        # ── Klasörü oluştur ───────────────────────────────────────────────────────

        output_path.mkdir(parents=True, exist_ok=True)

        # ── Yazılabilirlik kontrolü ────────────────────────────────────────────────

        test_file = output_path / ".contentmanager_test"
        try:
            test_file.write_text("test")
            test_file.unlink()
        except PermissionError:
            raise HTTPException(
                status_code=400,
                detail=f"Output klasörü yazılabilir değil: {output_path}. İzinleri kontrol edin.",
            )
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Output klasörüne yazılamıyor: {str(e)}",
            )

        return output_path

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Path işlenemedi: {str(e)}",
        )
