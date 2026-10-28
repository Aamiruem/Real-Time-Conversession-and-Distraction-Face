# cv — computer-vision attention engine

`AttentionDetector.process(frame_bgr)` runs MediaPipe Face Mesh (468 landmarks + iris) on each frame and computes:

* **EAR** (eye aspect ratio) → blinks, and drowsiness when the eyes stay closed longer than 1.2 s
* **MAR** (mouth aspect ratio) → yawns
* **Head pose** (OpenCV `solvePnP`) → yaw / pitch / roll
* **Gaze** (iris position between the eye corners)

Time spent in each state (Focused / Distracted / Drowsy / Yawning / No Face) gives the live focus %.
Thresholds are in `Thresholds`. Used by the Focus Monitor, Speech Coach (eye contact) and AI Lab.
