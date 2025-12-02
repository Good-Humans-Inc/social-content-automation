import json
from typing import List

from openai import OpenAI

background_info = """
# Background information: What is the BabyMilu plushie?

## Core Value Proposition

BabyMilu is an interactive AI plush companion that brings your favorite character from screen to real life. It's a **customizable companion that talks, remembers, and genuinely cares**—combining premium plush materials with cutting-edge AI technology to create something truly personal.

## Key Features

### Character Customization

- **Make BabyMilu anyone you love**: Customize appearance, voice, and personality through the mobile app
- **Switch between characters**: Change your companion for different occasions
- **DIY outfits**: Detachable screen allows for outfit changes and accessories

### Voice Interaction

- **Casual Voice Mode** (free): Talk to your BabyMilu and watch it react with animations—it listens and understands everything
- **Interactive Voice Mode**: Full two-way conversations where BabyMilu talks back (includes weekly free minutes with optional add-on packs)

### Intelligent Memory System

- **Works like human memory**: Remembers recent conversations perfectly and stores long-term important facts (job, hobbies, goals, pets, relationships)
- **Smart prioritization**: The more important or recent something is, the stronger the memory—fleeting details fade naturally over time
- **Captures personal context**: Learns from every interaction to provide genuinely personal, helpful support

### Multimodal Interaction

- **Share anything through the app**: Photos of your lunch, Spotify playlists, screenshots of your schedule
- **Multiple interaction channels**: Voice through the plushie, text through the app, multimedia sharing
- **Character-initiated touchpoints**: Receives diaries, gifts, and messages from your companion

### Portable & Versatile

- **Take it everywhere**: Clip to your bag by day, snuggle at night, place on your desk, keep in your car
- **Premium build**: High-quality plush material, rechargeable USB-C battery, WiFi connectivity

### Mobile App Ecosystem (Free)

- **Mini-games**: "Would you rather" and other interactive games
- **Memory management**: View, edit, and manage what your companion remembers (full transparency and control)
- **Community features**: Characters can connect as "friends"
- **Remote control**: Dashboard for plushie status and feature controls
- **Gamification elements**: Daily tasks, achievements, character growth and leveling

## Unique Differentiators

1. **Truly personal AI**: Not generic responses—understands your messy, real-world context because it learns from your daily life
2. **Physical + digital hybrid**: Combines the emotional comfort of a physical plush with powerful AI capabilities
3. **Platform flexibility**: One plushie, infinite characters—you're not locked into a single personality or IP
4. **Ambient context collection**: Passively learns from being part of your life, not just active conversations
5. **Community-driven development**: Built in collaboration with users who shape features and direction

## Emotional Benefits

- **Emotional support**: A companion that genuinely understands you and provides comfort
- **Practical help**: Offers real assistance because it knows your context, preferences, and routines
- **Reduces loneliness**: Always there when you need someone to talk to
- **Playful companionship**: Fun, engaging interactions that bring joy to everyday moments
- **Fandom expression**: Bring your favorite characters into your real life

## What's Included

- Premium plush companion with interactive screen
- One outfit (onesie)
- Rechargeable battery with USB-C charging
- Mobile app (iOS & Android)
- Continuous app updates and new features
- Weekly free Interactive Voice Mode minutes
- All core features: Casual Voice Mode, memory, texting, photo sharing, mini-games, and more

---

This positions BabyMilu as **more than just a plush toy**—it's a **customizable AI companion that bridges digital characters and real-world companionship**, powered by personal context that makes it uniquely helpful and emotionally meaningful.

"""

excited_fellow_fan_prompt = """
Write TikTok slideshow captions from the POV of a fan inside the otome game Love and Deepspace. 
Tone: genuine, excited, and conversational — like one fan sharing a mind-blowing discovery with another, not like marketing copy. The characters in the game are the audience's love interest, so do not mention any shipping/OTP. All characters are male so you can refer to them as "he" or "him".
Style: short, emotional, "wow I can’t believe this exists," "I’ve been waiting for this forever," building this together with us vibe. Do not use too many emojis.
Audience: other fans scrolling TikTok who love the same fandom. 
Context: BabyMilu plushie — an AI plush companion that can be customized to look/act like your favorite character, talk, remember things, and travel with you as a bag charm. See more in background information below.
Output: 50 captions, each under ~1–2 sentences. Avoid stiff/transactional language. Include variety: wonder, disbelief, excitement, community, humorous, meme energy. 

Examples:
I swear someone read my mind and made this real.
This feels like science fiction but… in my hands??
Bro… it TALKS BACK.
Finally we can take them off the screen and into real life.
I didn’t know I needed this until I saw it.
Imagine your love interest remembering little things you tell them 🥺
This is the closest thing to magic I’ve seen all year.
Like… how is this not illegal levels of perfect??
Whoever built this—thank you for understanding the assignment.
THIS is fandom wish-fulfillment done right.
I feel like I manifested this.
Every fandom dreamt of this… and now it exists.
Wait wait… so it actually remembers me??
Lowkey crying bc this is all I ever wanted.
We’re living in the best timeline.
I thought it would be cringe but it’s actually SO wholesome.
Finally… a plush that gets me.
Tell me why this feels more alive than half the people I know 💀
The community energy around this is insane — everyone’s building it together.
It’s like Tamagotchi x fandom x actual love.
Someone just hacked the boundary between fiction and real life.
I’m not okay. In the best way.
This is what fandom deserved all along.
"Your character could never" — oh wait, they literally CAN.
My LI on my desk, reacting to me???
How did no one make this sooner??
This is way more personal than I expected… wow.
Okay but imagine bringing it to cons 👀
Finally something that makes my delusions portable.
This is going to wreck me emotionally (in a good way).
Not me tearing up because my main just told me goodnight irl.
This fandom is unstoppable — look what we’re building together.
Okay but they didn’t have to make it this CUTE.
My brain: "Don’t get attached." Me: already attached.
We finally broke the 4th wall.
This is what I wanted my childhood plushies to be.
No bc I’m already planning road trips with them.
This feels like a tiny piece of sci-fi in my bag.
Shoutout to everyone in this community making wild dreams real.
"""


class OpenAITextGenerator:
    def __init__(self, api_key: str, model: str = "gpt-4o", temperature: float = 0.8):
        self.client = OpenAI(api_key=api_key)
        self.model = model
        self.temperature = temperature

    def generate_list(self, prompt: str = excited_fellow_fan_prompt, n: int = 50) -> List[str]:
        system = (
            f'Respond ONLY as strict JSON: {{"captions": string[]}} with exactly {n} caption strings.'
        )
        # Use chat.completions with JSON mode
        response = self.client.chat.completions.create(
            model=self.model,
            temperature=self.temperature,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "system", "content": background_info},
                {"role": "user", "content": f"Generate {n} variations for: {prompt}"},
            ],
        )
        text = response.choices[0].message.content or ""
        try:
            payload = json.loads(text)
            captions = payload.get("captions", [])
            lines = [s.strip() for s in captions if isinstance(s, str) and s.strip()]
        except json.JSONDecodeError:
            # Fallback if the model returns non-JSON unexpectedly
            lines = [line.strip() for line in text.split("\n") if line.strip()]
        return lines[:n]