"""Load the native AI runtimes on the main thread, in a safe order, before anything else starts threads.

* CTranslate2 (Whisper) must load before scikit-learn: on Windows their OpenMP runtimes crash the process
  when scikit-learn comes first.
* Loading NumPy/OpenBLAS (and friends) for the first time inside a worker thread can deadlock on Windows
  while another thread is blocked reading stdin — exactly the situation of the stdio MCP server.

Import this module first in every entry point (API, MCP server).
"""
import numpy  # noqa: F401

try:
    import ctranslate2  # noqa: F401
    import av  # noqa: F401
except ImportError:  # speech dependencies not installed — speech features will report it
    pass

import sklearn.ensemble  # noqa: F401,E402  (after ctranslate2, see above)
