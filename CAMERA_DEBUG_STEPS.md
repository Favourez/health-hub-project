# 🔍 Camera Not Working - Debug Steps

## ⚠️ Issue: Cameras do not work anymore

I've added extensive debugging to help identify the problem. Follow these steps:
Failed to load pharmacies on map: Failed to fetch pharmacies
Failed to load drugs: Failed to fetch drugs
Failed to load pharmacies: Failed to fetch pharmacies
---Failed to load pharmacies on map: Failed to fetch pharmacies
Failed to load drugs: Failed to fetch drugs
Failed to load pharmacies: Failed to fetch pharmacies

## 🧪 Step 1: Test Simple Camera Page First

**Open this page:**
```
http://localhost:8000/test-camera.html
```

**What to do:**
1. Click "Start Camera" button
2. Allow camera permission
3. **Does your camera work here?**

**If YES:** Camera is fine, issue is with video-call.js
**If NO:** Camera/browser issue, not code issue

---

## 🧪 Step 2: Test Video Call Page with Console Open

**Open browser console FIRST:**
- Press `F12`
- Click "Console" tab
- **Keep it open!**

**Then open:**
```
http://localhost:8000/video-call.html?consultation_id=1
```

**Watch the console logs carefully!**

---

## 📊 What Console Logs Should Show

### **If Camera Works:**
```
✅ video-call.js loaded
Consultation ID: 1
🚀 Setting up page load listener...
✅ video-call.js fully loaded and ready!
📄 Page loaded! Starting video call...
🎬 Starting video call initialization...
🔄 showLoading called: true
✅ Loading overlay updated
📊 Status update: connecting Requesting camera access...
📹 Requesting camera and microphone...
📹 Calling getUserMedia...
✅ Got local media stream! MediaStream {...}
Video tracks: [MediaStreamTrack]
Audio tracks: [MediaStreamTrack]
Local video element: <video id="localVideo">
✅ Set srcObject
✅ Local video playing
✅ Placeholder hidden
```

### **If Camera Permission Denied:**
```
❌ Error initializing video call: NotAllowedError
Error name: NotAllowedError
Error message: Permission denied
```

### **If No Camera Found:**
```
❌ Error initializing video call: NotFoundError
Error name: NotFoundError
Error message: Requested device not found
```

### **If API/Backend Error:**
```
✅ Got local media stream!
✅ Local video playing
🔗 Starting video call on backend...
❌ Backend API error: [error details]
This is OK - camera still works, just no peer connection
⚠️ Camera working, but backend connection failed
```

---

## 🎯 Tell Me What You See

**Please copy and paste:**

1. **What happens on test-camera.html?**
   - Does camera work? YES / NO
   - Any errors?

2. **What console logs appear on video-call.html?**
   - Copy the FULL console output
   - Include any red error messages

3. **What do you see on the page?**
   - Loading spinner?
   - Black video area?
   - Your video?
   - Any error messages?

4. **Did browser ask for camera permission?**
   - YES / NO
   - If yes, did you click "Allow"?

---

## 🔧 Common Issues & Quick Fixes

### **Issue: No permission dialog appears**
**Fix:**
1. Click the camera icon in address bar (next to URL)
2. Select "Allow" for camera and microphone
3. Refresh the page

### **Issue: Permission denied**
**Fix:**
1. Go to browser settings
2. Privacy & Security → Site Settings → Camera
3. Find localhost:8000
4. Change to "Allow"
5. Refresh the page

### **Issue: Camera in use by another app**
**Fix:**
1. Close Zoom, Teams, Skype, etc.
2. Restart browser
3. Try again

### **Issue: Black video but no errors**
**Fix:**
1. Check if video element has `autoplay` and `playsinline` attributes
2. Try clicking on the video area
3. Check console for "play() failed" errors

---

## 🚨 Emergency: Revert to Simple Version

If nothing works, I can create a super simple version that ONLY shows your camera without any WebRTC complexity.

---

## 📝 Checklist

- [ ] Opened test-camera.html
- [ ] Clicked "Start Camera"
- [ ] Camera works on test page: YES / NO
- [ ] Opened video-call.html with console (F12)
- [ ] Copied console logs
- [ ] Noted what appears on screen
- [ ] Ready to share results

---

**Please test both pages and share the console output!** 🔍

