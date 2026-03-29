"""
News Bulletin Modulu --- Haber bulteni video uretim pipeline'i.

RSS/URL tabanli haber kaynaklarindan cekilen iceriklerle
bulten formatinda YouTube videosu uretir.
"""

from backend.modules.news_bulletin.pipeline import NewsBulletinModule

news_bulletin_module = NewsBulletinModule()

__all__ = ["news_bulletin_module"]
