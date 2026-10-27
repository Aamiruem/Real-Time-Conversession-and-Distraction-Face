# speech — speech coach engine

`analyze(audio_16k_mono, eye_contact=None, passage=None)` returns a full coaching report:

* faster-whisper transcript with per-word timing and recognition probability
* pace (words per minute), filler words, hesitation pauses, hedging language
* pronunciation clarity (recognition confidence) and, in read-aloud mode, alignment against the passage
* loudness and pitch variety from an autocorrelation pitch tracker
* a 0-100 confidence score, prioritised tips, strengths and a "confident rewrite" of what was said

The model (`base.en`, ~150 MB) downloads on first use and runs offline after that.
