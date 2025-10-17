# 🚨 Real-Time Siren Alert System

## What's New

Your RugAlert now has **real-time monitoring with dramatic siren alerts**!

---

## ✨ Features

### 1. **Auto-Refresh Monitoring** 
- 🔄 Polls `/api/events` every 5 seconds
- 🟢 Live status indicator shows when monitoring is active
- ⏰ Displays last update timestamp
- ⏸️ Toggle auto-refresh on/off anytime

### 2. **New RUG Detection**
- 🔍 Automatically detects when a new RUG appears
- 💾 Tracks previously seen RUGs to identify new ones
- ⚡ Instant alert trigger when new RUG is detected

### 3. **Dramatic Siren Alert** 🚨
When a new RUG is detected:

#### **Visual Effects:**
- 🔴 **Flashing red overlay** covers the entire screen
- 💡 **Animated siren lights** in all four corners
- 🎆 **Pulsing red background** creates urgency
- 🎬 **Scale-in animation** for the alert modal
- ⚡ **Bouncing siren emoji** (🚨)
- ✨ **Red glow effects** around the icon

#### **Alert Content:**
- 🚨 Large "RUG DETECTED!" headline
- 🖼️ Validator icon and name
- 📊 Before/after commission comparison
- 📅 Epoch number
- 🔗 "View Details" button
- ❌ "Dismiss" button

#### **Sound:**
- 🔊 **Alternating siren tone** (800Hz ↔ 1200Hz)
- 🎵 Generated with Web Audio API (no file needed!)
- 🔄 Loops until dismissed
- ⏱️ Auto-stops after 15 seconds

### 4. **Test Button** 🧪
- 🚨 "Test Alert" button in the status bar
- 📝 Triggers a demo RUG alert
- ✅ Perfect for testing the siren system
- 🎨 See all the animations and hear the sound

---

## 🎮 How to Use

### **Normal Operation:**

1. **Visit the dashboard** - Auto-refresh is ON by default
2. **Leave the page open** - It will monitor automatically
3. **When a RUG is detected:**
   - Screen flashes red
   - Siren sound plays
   - Alert modal appears
   - Click "View Details" or "Dismiss"

### **Test the System:**

1. Click the **"🚨 Test Alert"** button in the status bar
2. Watch the dramatic siren alert in action!
3. Hear the sound (make sure volume is up)
4. Dismiss the alert when done

### **Controls:**

- **Pause/Start** - Toggle auto-refresh monitoring
- **Lookback epochs** - Control how far back to search
- **Search** - Filter by validator name or pubkey

---

## 🔧 Technical Details

### **Auto-Refresh Logic**
```typescript
// Polls every 5 seconds when enabled
useEffect(() => {
  if (!autoRefresh) return;
  const interval = setInterval(() => {
    load(true); // Silent reload
  }, 5000);
  return () => clearInterval(interval);
}, [autoRefresh, epochs]);
```

### **RUG Detection**
```typescript
// Tracks previous RUGs, detects new ones
const currentRugs = newItems.filter((it) => it.type === "RUG");
const newRug = currentRugs.find(
  (rug) => !previousRugsRef.current.has(rug.id)
);
if (newRug) {
  triggerSirenAlert(newRug);
}
```

### **Siren Sound Generation**
```typescript
// Web Audio API generates alternating tones
const oscillator = ctx.createOscillator();
oscillator.frequency.value = 800; // Base frequency
// Alternates between 800Hz and 1200Hz every 0.5s
```

### **CSS Animations**
```css
@keyframes flash {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 0.6; }
}

@keyframes siren-left {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.3; transform: scale(1.5); }
}
```

---

## 🎨 Visual Design

### **Colors:**
- 🔴 Red (#DC2626) - Alert background
- 🟠 Red-900 (#7F1D1D) - Modal background
- ⚡ Red-500 (#EF4444) - Siren lights
- ⚪ White - Text and borders

### **Animations:**
- `animate-flash` - Full screen flash (0.5s)
- `animate-siren-left` - Left siren lights (1s)
- `animate-siren-right` - Right siren lights (1s)
- `animate-pulse-slow` - Background pulse (2s)
- `animate-scale-in` - Modal entrance (0.3s)
- `animate-bounce` - Siren emoji (1s)

### **Layout:**
- Full-screen overlay (z-index: 100)
- Centered modal with backdrop blur
- Responsive design (works on mobile)
- Accessible dismiss options

---

## 📱 User Experience

### **First Visit:**
1. Page loads with auto-refresh ON
2. Green pulsing indicator shows it's active
3. "Test Alert" button available immediately

### **When RUG Detected:**
1. **Sound starts** - Alternating siren tone
2. **Screen flashes red** - Impossible to miss
3. **Alert appears** - Full details shown
4. **Options available:**
   - View validator details
   - Dismiss alert
   - Auto-dismisses after 15 seconds

### **Peace of Mind:**
- ✅ Never miss a RUG (when page is open)
- ✅ Instant visual and audio alerts
- ✅ Always know monitoring is active
- ✅ Can pause anytime if needed

---

## 🎯 Perfect For

✅ **Stake pool operators** - Monitor validators continuously  
✅ **Delegators** - Protect your stake  
✅ **Security researchers** - Track validator behavior  
✅ **Dashboard displays** - Leave it running on a monitor  
✅ **Demo purposes** - Test button shows it off  

---

## 🚀 Performance

- **Efficient polling** - Only 5-second intervals
- **Smart updates** - Doesn't reload if data unchanged
- **Minimal bandwidth** - Small API responses
- **No external audio** - Generated in-browser
- **Lightweight animations** - CSS-based, GPU accelerated

---

## 🔧 Customization

### **Change polling interval:**
```typescript
}, 5000); // 5 seconds - change this number
```

### **Adjust auto-dismiss time:**
```typescript
}, 15000); // 15 seconds - change this number
```

### **Modify siren frequencies:**
```typescript
const freq = i % 2 === 0 ? 800 : 1200; // Change these Hz values
```

### **Adjust sound volume:**
```typescript
gainNode.gain.value = 0.15; // 0.0 to 1.0
```

---

## 🎉 Try It Now!

1. **Start your dev server:**
   ```bash
   npm run dev
   ```

2. **Open http://localhost:3000**

3. **Click "🚨 Test Alert"**

4. **Experience the drama!** 🎬🚨

---

## 📝 Notes

- **Browser permissions** - Sound requires user interaction first (that's why test button is needed)
- **Tab visibility** - Polling continues even in background tabs
- **Performance** - Uses efficient React patterns (refs, memoization)
- **Accessibility** - High contrast, keyboard accessible
- **Mobile-friendly** - Responsive design works on all devices

---

## 🎊 Enjoy!

Your RugAlert is now a **real-time monitoring powerhouse** with Hollywood-style alerts! 

Never miss a RUG again! 🚨🎃

**Features:**
- ✅ Auto-refresh every 5 seconds
- ✅ Dramatic visual alerts
- ✅ Alternating siren sound
- ✅ Flashing red lights
- ✅ Test button for demos
- ✅ Full validator details
- ✅ Auto-dismiss option

**Perfect for leaving on a display and walking away** - you'll know immediately if a RUG happens! 🔊💥

