"""Central configuration. Change values here, not inside the modules."""

HORIZON = 28                     # forecast horizon in days (all features are shifted by at least this much)
N_FOLDS = 4                      # rolling-origin backtest folds, each HORIZON days long
QUANTILES = [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]

DEFAULT_HOLDING_COST = 1.0       # cost of one unsold unit
DEFAULT_STOCKOUT_COST = 4.0      # cost of one unit of unmet demand

MONITOR_WEEKS = 16               # length of the simulated production window
DRIFT_BIAS_THRESHOLD = 0.25      # a series whose last-28-day demand is >25% away from the frozen forecast is flagged.
                                 # Chosen above the largest bias seen in the healthy reference window (about 20%).
PSI_WATCH, PSI_ALERT = 0.10, 0.25  # conventional PSI bands for the pooled weekly distribution check
PERF_RATIO_THRESHOLD = 1.25      # weekly WAPE above (reference WAPE x this) raises a performance alert

LGBM_PARAMS = dict(
    n_estimators=250,
    learning_rate=0.06,
    num_leaves=31,
    min_child_samples=20,
    subsample=0.8,
    subsample_freq=1,
    colsample_bytree=0.8,
    reg_lambda=1.0,
    n_jobs=1,
    random_state=7,
    verbose=-1,
)
