import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const messages = [{ type: "message", messageId: "m-1", message: "Olá" }];
  const history = {
    messages,
    setMessages: vi.fn(),
    offlineQueue: [],
    setOfflineQueue: vi.fn(),
    historyLoading: false,
    loadMessageHistory: vi.fn().mockResolvedValue(undefined),
    messagesRef: { current: null },
    handleMessagesScroll: vi.fn(),
    clearLocalHistory: vi.fn(),
  };
  const directory = {
    users: [{ id: "1", username: "kael", displayName: "Kael", role: "owner" }],
    setUsers: vi.fn(),
    profilesById: { "1": { username: "kael" } },
    mergeUser: vi.fn(),
    syncProfile: vi.fn(),
  };
  const connection = {
    connected: false,
    connectionStatus: "disconnected",
    reconnectAttempt: 0,
    reconnectSeconds: 0,
    isConnected: vi.fn(() => false),
    getSocket: vi.fn(() => null),
    socketRef: { current: null },
  };
  const actions = {
    contextMenu: null,
    editingId: null,
    editingText: "",
    editSaving: false,
    reactionPickerMessageId: null,
    replyingTo: null,
    flushQueue: vi.fn(),
    setContextMenu: vi.fn(),
    setEditError: vi.fn(),
    setEditSaving: vi.fn(),
    setEditingId: vi.fn(),
    setEditingText: vi.fn(),
    setReactionPickerMessageId: vi.fn(),
    setReplyingTo: vi.fn(),
  };
  const profileEditor = {
    profileOpen: false,
    profileError: "",
    profileSaving: false,
    avatarPreviewUrl: "",
    openProfile: vi.fn(),
    closeProfile: vi.fn(),
    saveProfile: vi.fn(),
    chooseAvatar: vi.fn(),
  };
  return { history, directory, connection, actions, profileEditor };
});

vi.mock("../src/hooks/useChatHistory", () => ({
  useChatHistory: vi.fn(() => mocks.history),
}));

vi.mock("../src/hooks/useUserDirectory", () => ({
  useUserDirectory: vi.fn(() => mocks.directory),
}));

vi.mock("../src/hooks/useChatConnection", () => ({
  useChatConnection: vi.fn(() => mocks.connection),
}));

vi.mock("../src/hooks/useChatActions", () => ({
  useChatActions: vi.fn(() => mocks.actions),
}));

vi.mock("../src/hooks/useChatMessageEvents", () => ({
  useChatMessageEvents: vi.fn(() => vi.fn()),
}));

vi.mock("../src/hooks/useProfileEditor", () => ({
  useProfileEditor: vi.fn(() => mocks.profileEditor),
}));

import { ChatProvider, useChatContext } from "../src/context/ChatContext";

function Probe() {
  const context = useChatContext();
  return (
    <>
      <output data-testid="user">{context.user.username}</output>
      <output data-testid="message-count">{context.messages.length}</output>
      <button type="button" onClick={context.clearLocalHistory}>
        clear
      </button>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ChatProvider", () => {
  it("exposes authenticated user and aggregated chat state through context", () => {
    const user = { id: "1", username: "kael", displayName: "Kael", role: "owner" };

    render(
      <ChatProvider user={user} syncUser={vi.fn()} onAuthenticationRequired={vi.fn()}>
        <Probe />
      </ChatProvider>,
    );

    expect(screen.getByTestId("user").textContent).toBe("kael");
    expect(screen.getByTestId("message-count").textContent).toBe("1");
  });

  it("keeps context mutations connected to the underlying hooks", () => {
    const user = { id: "1", username: "kael", role: "owner" };

    render(
      <ChatProvider user={user} syncUser={vi.fn()} onAuthenticationRequired={vi.fn()}>
        <Probe />
      </ChatProvider>,
    );

    screen.getByRole("button", { name: "clear" }).click();
    expect(mocks.history.clearLocalHistory).toHaveBeenCalledTimes(1);
  });

  it("throws when the context hook is used outside the provider", () => {
    expect(() => render(<Probe />)).toThrow(
      "useChatContext deve ser usado dentro de ChatProvider",
    );
  });
});
