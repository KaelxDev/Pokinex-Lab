import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  onLogout: vi.fn(),
  context: {
    user: { id: "1", username: "kael" },
    profile: { id: "1", username: "kael" },
    users: [],
    openProfile: vi.fn(),
    clearLocalHistory: vi.fn(),
    connectionStatus: "connected",
    reconnectAttempt: 0,
    reconnectSeconds: 0,
    messages: [],
    profilesById: {},
    connected: true,
    historyLoading: false,
    messagesRef: { current: null },
    handleMessagesScroll: vi.fn(),
    editingId: null,
    editingText: "",
    editSaving: false,
    editError: "",
    setEditingText: vi.fn(),
    saveEdit: vi.fn(),
    cancelEdit: vi.fn(),
    reactionPickerMessageId: null,
    toggleReactionPicker: vi.fn(),
    handleReaction: vi.fn(),
    openContextMenu: vi.fn(),
    startLongPress: vi.fn(),
    endLongPress: vi.fn(),
    offlineQueue: [],
    replyingTo: null,
    messageInput: "",
    setMessageInput: vi.fn(),
    sendMessage: vi.fn(),
    setReplyingTo: vi.fn(),
    contextMenu: null,
    setContextMenu: vi.fn(),
    setReactionPickerMessageId: vi.fn(),
    beginReply: vi.fn(),
    copyMessage: vi.fn(),
    beginEdit: vi.fn(),
    confirmDelete: vi.fn(),
    profileOpen: false,
    profileError: "",
    profileSaving: false,
    avatarPreviewUrl: "",
    closeProfile: vi.fn(),
    saveProfile: vi.fn(),
    chooseAvatar: vi.fn(),
  },
}));

vi.mock("../src/context/ChatContext", () => ({
  useChatContext: vi.fn(() => mocks.context),
}));

vi.mock("../src/components/ChatSidebar", () => ({
  default: ({ onOpenProfile }) => (
    <aside data-testid="chat-sidebar">
      <button type="button" onClick={onOpenProfile}>profile</button>
    </aside>
  ),
}));

vi.mock("../src/components/ChatHeader", () => ({
  default: ({ onLogout }) => (
    <header data-testid="chat-header">
      <button type="button" onClick={onLogout}>logout</button>
    </header>
  ),
}));

vi.mock("../src/components/MessageList", () => ({
  default: () => <div data-testid="message-list" />,
}));

vi.mock("../src/components/MessageComposer", () => ({
  default: ({ onSubmit, onCancelReply }) => (
    <div data-testid="message-composer">
      <button type="button" onClick={() => onSubmit({ preventDefault: vi.fn() })}>send</button>
      <button type="button" onClick={onCancelReply}>cancel-reply</button>
    </div>
  ),
}));

vi.mock("../src/components/MessageContextMenu", () => ({
  default: ({ onReply, onCopy }) => (
    <div data-testid="message-context-menu">
      <button type="button" onClick={onReply}>reply</button>
      <button type="button" onClick={onCopy}>copy</button>
    </div>
  ),
}));

vi.mock("../src/components/ProfileModal", () => ({
  default: () => <div data-testid="profile-modal" />,
}));

import ChatWorkspace from "../src/components/ChatWorkspace";

describe("ChatWorkspace", () => {
  it("composes the major chat regions from ChatContext state", () => {
    render(<ChatWorkspace onLogout={mocks.onLogout} />);

    expect(screen.getByTestId("chat-sidebar")).toBeTruthy();
    expect(screen.getByTestId("chat-header")).toBeTruthy();
    expect(screen.getByTestId("message-list")).toBeTruthy();
    expect(screen.getByTestId("message-composer")).toBeTruthy();
    expect(screen.getByTestId("message-context-menu")).toBeTruthy();
    expect(screen.getByTestId("profile-modal")).toBeTruthy();
  });

  it("forwards logout and composer actions without owning chat state", async () => {
    const user = userEvent.setup();
    render(<ChatWorkspace onLogout={mocks.onLogout} />);

    await user.click(screen.getByRole("button", { name: "logout" }));
    await user.click(screen.getByRole("button", { name: "send" }));

    expect(mocks.onLogout).toHaveBeenCalledTimes(1);
    expect(mocks.context.sendMessage).toHaveBeenCalledTimes(1);
  });
});
