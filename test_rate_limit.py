from app.rate_limit import allow_request


def test_rate_limit_allows_until_limit_then_blocks():
    key = "test-rate-limit"
    assert allow_request(key, 2, 60) is True
    assert allow_request(key, 2, 60) is True
    assert allow_request(key, 2, 60) is False
