from io import BytesIO

import pytest
from fastapi import HTTPException
from PIL import Image

from app.routes.auth import _validate_image


def _image_bytes(image_format: str, size: tuple[int, int] = (32, 32)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, "white").save(buffer, format=image_format)
    return buffer.getvalue()


def test_validate_image_accepts_matching_png():
    _validate_image(_image_bytes("PNG"), "image/png")


def test_validate_image_rejects_mismatched_content_type():
    with pytest.raises(HTTPException) as error:
        _validate_image(_image_bytes("PNG"), "image/jpeg")

    assert error.value.status_code == 400


def test_validate_image_rejects_oversized_dimensions():
    with pytest.raises(HTTPException) as error:
        _validate_image(_image_bytes("PNG", (2049, 32)), "image/png")

    assert error.value.status_code == 400
