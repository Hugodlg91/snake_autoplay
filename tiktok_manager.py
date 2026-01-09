try:
    from TikTokLive import TikTokLiveClient
    from TikTokLive.events import LikeEvent, CommentEvent, GiftEvent, ConnectEvent
    TIKTOK_AVAILABLE = True
except ImportError:
    TIKTOK_AVAILABLE = False
    print("TikTokLive library not found. Running without live integration.")

class TikTokManager:
    def __init__(self, game, unique_id: str):
        self.game = game
        self.client = None
        self.unique_id = unique_id
        
        if TIKTOK_AVAILABLE:
            try:
                print("Init TikTokClient...")
                self.client = TikTokLiveClient(unique_id=unique_id)
                print("TikTokClient created. Setting up events...")
                self.setup_events()
                print("Events setup done.")
            except Exception as e:
                import traceback
                traceback.print_exc()
                print(f"Failed to initialize TikTok Client: {e}")

    def setup_events(self):
        @self.client.on(ConnectEvent)
        async def on_connect(event: ConnectEvent):
            print(f"✅ TIKTOK CONNECTED to @{self.unique_id}")

        @self.client.on(LikeEvent)
        async def on_like(event: LikeEvent):
            # Log user action
            print(f"[TIKTOK] Like from {event.user.unique_id}: +{event.count}")
            
            # Update Game State
            self.game.hype_level = min(100, self.game.hype_level + event.count * 0.2)
            
        @self.client.on(CommentEvent)
        async def on_comment(event: CommentEvent):
            print(f"[TIKTOK] Comment from {event.user.unique_id}: {event.comment}")
            if "boost" in event.comment.lower():
                self.game.force_shortcut = True
                print("🚀 CHAT BOOST ACTIVATED!")
                
        @self.client.on(GiftEvent)
        async def on_gift(event: GiftEvent):
            print(f"🎁 GIFT! {event.gift.info.name} from {event.user.unique_id}")
            self.game.current_effect = "GOLD_RAIN"
            self.game.hype_level = min(100, self.game.hype_level + 50)

    async def start(self):
        if self.client:
            print(f"🔌 Attempting to connect to TikTok Live (@{self.unique_id})...")
            try:
                # Run in a non-blocking way if possible, or just start background task
                await self.client.start()
            except Exception as e:
                print(f"TikTok Connection Error: {e}")
