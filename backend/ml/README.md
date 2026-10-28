# ml — fatigue-risk model

| File | Role |
|---|---|
| `features.py` | the 9 features and how they come from a saved session |
| `dataset.py` | synthetic cold-start data + user-labelled sessions from the database |
| `train.py` | CV model selection (LogReg / RandomForest / GradientBoosting), held-out evaluation, model card |
| `predict.py` | loads the artifact (trains it on first use if it is missing) and explains predictions |

```
python -m ml.train            # synthetic only
python -m ml.train --with-db  # + real labels from "How tired do you feel?" after each session
```

Artifacts are written to `backend/ml/artifacts/` (gitignored; the backend Docker image builds them).
