import pytest

from app.infrastructure.realtime import InMemoryRealtimeBus


@pytest.mark.asyncio
async def test_realtime_bus_publishes_to_all_sinks():
    bus = InMemoryRealtimeBus()
    received = []

    async def sink_one(event):
        received.append(("one", event))
        return False

    async def sink_two(event):
        received.append(("two", event))
        return False

    bus.subscribe(sink_one)
    bus.subscribe(sink_two)

    failed = await bus.publish({"type": "message", "messageId": "42"})

    assert failed is False
    assert received == [
        ("one", {"type": "message", "messageId": "42"}),
        ("two", {"type": "message", "messageId": "42"}),
    ]


@pytest.mark.asyncio
async def test_realtime_bus_reports_failed_sink_and_keeps_other_sinks():
    bus = InMemoryRealtimeBus()
    received = []

    async def failed_sink(_event):
        return True

    async def healthy_sink(event):
        received.append(event)
        return False

    bus.subscribe(failed_sink)
    bus.subscribe(healthy_sink)

    failed = await bus.publish({"type": "system"})

    assert failed is True
    assert received == [{"type": "system"}]
