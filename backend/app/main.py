from pathlib import Path
from fastapi import FastAPI,WebSocket,WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.auth import get_user_from_token
from app.database import initialize_database
from app.routes.auth import router as auth_router
from app.websocket.chat import manager
initialize_database();APP_DIR=Path(__file__).resolve().parent;MEDIA_DIR=APP_DIR/"uploads";AVATAR_DIR=MEDIA_DIR/"avatars";AVATAR_DIR.mkdir(parents=True,exist_ok=True)
app=FastAPI(title="Poknex API",version="2.0.0");app.add_middleware(CORSMiddleware,allow_origins=["http://localhost:5173","http://127.0.0.1:5173"],allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$",allow_credentials=True,allow_methods=["*"],allow_headers=["*"]);app.mount("/media",StaticFiles(directory=MEDIA_DIR),name="media");app.include_router(auth_router)
@app.get("/")
async def root():return {"message":"Poknex API","status":"online"}
@app.websocket("/ws")
async def websocket_endpoint(websocket:WebSocket):
 token=websocket.query_params.get("token");user=get_user_from_token(token)
 if not user:await websocket.close(code=1008);return
 await manager.connect(websocket,user)
 try:
  while True:
   data=await websocket.receive_json();event_type=data.get("type","message");message_id=data.get("messageId")
   if event_type in {"edit_message","delete_message","reaction"}:
    if not isinstance(message_id,str) or not message_id:continue
    if event_type=="edit_message":
     message=data.get("message","")
     if not isinstance(message,str):continue
     message=message.strip()
     if not message:await websocket.send_json({"type":"error","action":"edit_message","messageId":message_id,"message":"A mensagem não pode ficar vazia."});continue
     await manager.edit_message(user,message_id,message[:1000],websocket)
    elif event_type=="delete_message":await manager.delete_message(user,message_id,websocket)
    else:await manager.toggle_reaction(user,message_id,data.get("reaction",""),websocket)
    continue
   message=data.get("message","");reply_to_message_id=data.get("replyTo")
   if not isinstance(message,str):continue
   message=message.strip()
   if not message:continue
   if message_id is not None and not isinstance(message_id,str):message_id=None
   if reply_to_message_id is not None and not isinstance(reply_to_message_id,str):reply_to_message_id=None
   await manager.send_message(user,message[:1000],message_id,websocket,reply_to_message_id)
 except WebSocketDisconnect:
  disconnected_user=manager.disconnect(websocket)
  if disconnected_user:await manager.broadcast({"type":"system","event":"user_left","userId":disconnected_user["id"],"username":disconnected_user["username"],"displayName":disconnected_user["displayName"],"avatar":disconnected_user["avatar"],"message":f"{disconnected_user['username']} saiu do chat.","timestamp":manager.get_timestamp()});await manager.send_users()