import { useChatContext } from "../context/ChatContext";
import ChatHeader from "./ChatHeader";
import ChatSidebar from "./ChatSidebar";
import MessageComposer from "./MessageComposer";
import MessageContextMenu from "./MessageContextMenu";
import MessageList from "./MessageList";
import ProfileModal from "./ProfileModal";

export default function ChatWorkspace({ onLogout }) {
  const {
    user,
    profile,
    users,
    openProfile,
    clearLocalHistory,
    connectionStatus,
    reconnectAttempt,
    reconnectSeconds,
    messages,
    profilesById,
    connected,
    historyLoading,
    messagesRef,
    handleMessagesScroll,
    editingId,
    editingText,
    editSaving,
    editError,
    setEditingText,
    saveEdit,
    cancelEdit,
    reactionPickerMessageId,
    toggleReactionPicker,
    handleReaction,
    openContextMenu,
    startLongPress,
    endLongPress,
    offlineQueue,
    replyingTo,
    messageInput,
    setMessageInput,
    sendMessage,
    setReplyingTo,
    contextMenu,
    setContextMenu,
    setReactionPickerMessageId,
    beginReply,
    copyMessage,
    beginEdit,
    confirmDelete,
    profileOpen,
    profileError,
    profileSaving,
    avatarPreviewUrl,
    closeProfile,
    saveProfile,
    chooseAvatar,
  } = useChatContext();

  return (
    <section className="chat">
      <ChatSidebar
        user={user}
        profile={profile}
        users={users}
        onOpenProfile={openProfile}
        onClearHistory={clearLocalHistory}
      />

      <div className="chat-content">
        <ChatHeader
          connectionStatus={connectionStatus}
          reconnectAttempt={reconnectAttempt}
          reconnectSeconds={reconnectSeconds}
          onLogout={onLogout}
        />

        <MessageList
          messages={messages}
          user={user}
          profile={profile}
          profilesById={profilesById}
          connected={connected}
          historyLoading={historyLoading}
          messagesRef={messagesRef}
          onScroll={handleMessagesScroll}
          editingId={editingId}
          editingText={editingText}
          editSaving={editSaving}
          editError={editError}
          onEditingTextChange={setEditingText}
          onSaveEdit={saveEdit}
          onCancelEdit={cancelEdit}
          reactionPickerMessageId={reactionPickerMessageId}
          onToggleReactionPicker={toggleReactionPicker}
          onReaction={handleReaction}
          onOpenContextMenu={openContextMenu}
          onLongPressStart={startLongPress}
          onLongPressEnd={endLongPress}
        />

        <MessageComposer
          connected={connected}
          offlineQueueLength={offlineQueue.length}
          replyingTo={replyingTo}
          messageInput={messageInput}
          onChange={setMessageInput}
          onSubmit={sendMessage}
          onCancelReply={() => setReplyingTo(null)}
        />
      </div>

      <MessageContextMenu
        contextMenu={contextMenu}
        onReact={() => {
          setReactionPickerMessageId(contextMenu?.message?.messageId || null);
          setContextMenu(null);
        }}
        onReply={() => contextMenu && beginReply(contextMenu.message)}
        onCopy={() => contextMenu && copyMessage(contextMenu.message)}
        onEdit={() => contextMenu && beginEdit(contextMenu.message)}
        onDelete={() => contextMenu && confirmDelete(contextMenu.message)}
      />

      <ProfileModal
        open={profileOpen}
        user={user}
        profile={profile}
        avatarPreview={avatarPreviewUrl}
        profileError={profileError}
        profileSaving={profileSaving}
        onClose={closeProfile}
        onSubmit={saveProfile}
        onChooseAvatar={chooseAvatar}
      />
    </section>
  );
}
