"""
Product Review Modülü — Ürün inceleme video üretim pipeline'ı.

Ürün adı ve teknik özellikler ile Pro/Con formatında
yapılandırılmış YouTube inceleme videosu üretir.
"""

from backend.modules.product_review.pipeline import ProductReviewModule

product_review_module = ProductReviewModule()

__all__ = ["product_review_module"]
