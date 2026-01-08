try:
    from TikTokLive import TikTokLiveClient
    from TikTokLive.types.events import LikeEvent, CommentEvent, GiftEvent
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
                self.client = TikTokLiveClient(unique_id=unique_id)
                self.setup_events()
            except Exception as e:
                print(f"Failed to initialize TikTok Client: {e}")

    def setup_events(self):
        @self.client.on("like")
        async def on_like(event: LikeEvent):
            self.game.hype_level = min(100, self.game.hype_level + event.count * 0.2)
            print(f"❤️ Hype Up! Total: {self.game.hype_level}")
            
        @self.client.on("comment")
        async def on_comment(event: CommentEvent):
            if "boost" in event.comment.lower():
                self.game.force_shortcut = True
                print("🚀 CHAT BOOST ACTIVATED!")
                
        @self.client.on("gift")
        async def on_gift(event: GiftEvent):
            print(f"🎁 GIFT! {event.gift.info.name}")
            self.game.current_effect = "GOLD_RAIN"
            self.game.hype_level += 50

    async def start(self):
        if self.client:
            try:
                # Run in a non-blocking way if possible, or just start background task
                await self.client.start()
            except Exception as e:
                print(f"TikTok Connection Error: {e}")
