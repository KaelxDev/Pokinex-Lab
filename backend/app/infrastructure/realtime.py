"""Realtime event transport boundary.

The application publishes events through this interface instead of coupling
application services to a concrete WebSocket transport. The default
implementation remains in-process for local/single-instance deployments and
can later be replaced by a Redis/pub-sub adapter without changing callers.
"""

from collections.abc import Awaitable, Callable
from typing import Protocol


EventSink = Callable[[dict], Awaitable[bool]]


class RealtimeBus(Protocol):
    """Application-facing interface for publishing realtime events."""

    async def publish(self, event: dict) -> bool:
        """Publish an event and return whether any sink failed."""


class InMemoryRealtimeBus:
    """Minimal in-process realtime bus used by the current deployment model."""

    def __init__(self) -> None:
        self._sinks: list[EventSink] = []

    def subscribe(self, sink: EventSink) -> None:
        if sink not in self._sinks:
            self._sinks.append(sink)

    def unsubscribe(self, sink: EventSink) -> None:
        try:
            self._sinks.remove(sink)
        except ValueError:
            pass

    async def publish(self, event: dict) -> bool:
        failed = False
        for sink in tuple(self._sinks):
            if await sink(event):
                failed = True
        return failed
