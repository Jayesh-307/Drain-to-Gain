import numpy as np
import pandas as pd
from statsmodels.tsa.arima.model import ARIMA
import io
import matplotlib
# Use non-interactive backend for server
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import base64

def clean_and_validate_dataset(df):
    """
    Validates the dataset columns and rows.
    Returns:
        tuple: (cleaned_df, errors_list, date_col)
    """
    errors = []
    
    # Drop rows where everything is NaN (very common in Excel files with formatting)
    df = df.dropna(how='all')
    
    if len(df) == 0:
        errors.append("The uploaded file does not contain any data rows.")
        return None, errors, None
    
    # 1. Look for Date/Time column
    date_cols = [c for c in df.columns if 'date' in c.lower() or 'year' in c.lower() or 'month' in c.lower()]
    if not date_cols:
        # Fallback to the first column if no typical date column is found
        date_col = df.columns[0]
        errors.append(f"No explicit Date/Time column found. Assuming '{date_col}' is the date column.")
    else:
        date_col = date_cols[0]
        
    # Drop rows where date column is empty/null
    df = df.dropna(subset=[date_col])
    
    if len(df) == 0:
        errors.append(f"No valid dates found in the date column '{date_col}'.")
        return None, errors, None
        
    # Convert date column to datetime
    try:
        df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
        # Drop rows where date conversion failed (resulted in NaT)
        df = df.dropna(subset=[date_col])
        # Sort by date
        df = df.sort_values(by=date_col)
    except Exception as e:
        errors.append(f"Failed to parse dates in column '{date_col}': {str(e)}")
        return None, errors, None
        
    # Check for empty dataset again
    if len(df) < 5:
        errors.append("Dataset must contain at least 5 rows with valid dates for time-series forecasting.")
        return None, errors, None
        
    # Identifiable target parameters
    expected_parameters = [
        "Average Rainfall (mm)",
        "pH",
        "Turbidity (NTU)",
        "Dissolved Oxygen (DO) (mg/L)",
        "Nitrates (mg/L)"
    ]
    
    # Check which parameters are present in the columns
    found_params = []
    for col in df.columns:
        if col == date_col:
            continue
        # Check if the column matches or contains the parameter name
        matched = False
        for expected in expected_parameters:
            if expected.lower() in col.lower() or col.lower() in expected.lower():
                found_params.append((col, expected))
                matched = True
                break
        if not matched:
            # Let it be parsed anyway as a generic parameter
            found_params.append((col, col))
            
    if not found_params:
        errors.append("No numerical parameter columns found besides the date column.")
        return None, errors, None

    # Let's clean the columns: convert to numeric, handle missing values
    cleaned_df = pd.DataFrame(index=df[date_col])
    
    for original_col, renamed_col in found_params:
        # Convert to numeric, coercion replaces invalid inputs with NaN
        series = pd.to_numeric(df[original_col], errors='coerce')
        nan_count = series.isna().sum()
        if nan_count > 0:
            errors.append(f"Column '{original_col}' contains {nan_count} missing or invalid values. They will be interpolated.")
            # Linear interpolation for time-series
            series = series.interpolate(method='linear').ffill().bfill()
        
        # Fallback for remaining NaNs (if interpolation failed because of all-NaNs)
        if series.isna().any():
            series = series.fillna(0.0)
            
        # Verify that we have numeric data now
        if series.isna().all():
            errors.append(f"Column '{original_col}' contains no valid numerical data.")
            continue
            
        cleaned_df[renamed_col] = series.values
        
    return cleaned_df, errors, date_col

def calculate_summary_statistics(df):
    """
    Computes summary stats for each parameter, ensuring absolute safety against NaNs.
    """
    stats = {}
    for col in df.columns:
        series = df[col]
        
        mean_val = series.mean()
        median_val = series.median()
        std_val = series.std()
        min_val = series.min()
        max_val = series.max()
        
        # Safely convert to float or fallback to 0.0 if NaN/null
        stats[col] = {
            "mean": float(np.round(mean_val, 2)) if not pd.isna(mean_val) else 0.0,
            "median": float(np.round(median_val, 2)) if not pd.isna(median_val) else 0.0,
            "std": float(np.round(std_val, 2)) if not pd.isna(std_val) else 0.0,
            "min": float(np.round(min_val, 2)) if not pd.isna(min_val) else 0.0,
            "max": float(np.round(max_val, 2)) if not pd.isna(max_val) else 0.0,
            "count": int(series.count())
        }
    return stats

def run_auto_arima(series, max_p=2, max_d=1, max_q=2):
    """
    Simple grid search for best ARIMA parameters using AIC.
    """
    best_aic = float("inf")
    best_order = (1, 1, 1) # Default fallback
    
    for p in range(max_p + 1):
        for d in range(max_d + 1):
            for q in range(max_q + 1):
                if p == 0 and d == 0 and q == 0:
                    continue
                try:
                    # Fit ARIMA model with low prints
                    model = ARIMA(series, order=(p, d, q))
                    res = model.fit()
                    if res.aic < best_aic:
                        best_aic = res.aic
                        best_order = (p, d, q)
                except Exception:
                    continue
    return best_order

def perform_forecast(series, steps, p=None, d=None, q=None):
    """
    Fits ARIMA model and forecasts future values.
    Returns:
        dict: containing dates, historical, forecast, bounds, parameters
    """
    # Detect frequency of the series index
    freq = pd.infer_freq(series.index)
    if freq is None:
        # Fallback to general frequencies
        diffs = series.index.to_series().diff().dropna()
        median_diff = diffs.median()
        if median_diff > pd.Timedelta(days=360):
            freq = 'YS' # Yearly
        elif median_diff > pd.Timedelta(days=27):
            freq = 'MS' # Monthly
        else:
            freq = 'D' # Daily
            
    # Reindex series with inferred freq to satisfy statsmodels requirement
    series = series.asfreq(freq)
    # If any NaNs introduced by asfreq, interpolate
    if series.isna().any():
        series = series.interpolate(method='linear').ffill().bfill()
        
    # Decide order (p, d, q)
    is_auto = False
    if p is None or d is None or q is None:
        p, d, q = run_auto_arima(series)
        is_auto = True
        
    # Fit ARIMA model
    try:
        model = ARIMA(series, order=(p, d, q))
        model_fit = model.fit()
    except Exception as e:
        # Fallback to ARIMA(1, 0, 0)
        p, d, q = 1, 0, 0
        model = ARIMA(series, order=(p, d, q))
        model_fit = model.fit()
        is_auto = True
        
    # Perform forecast
    forecast_res = model_fit.get_forecast(steps=steps)
    forecast_mean = forecast_res.predicted_mean
    
    # Get confidence intervals (default 95%)
    conf_int = forecast_res.conf_int(alpha=0.05)
    lower_col = conf_int.columns[0]
    upper_col = conf_int.columns[1]
    
    # Create lists for frontend
    hist_dates = series.index.strftime('%Y-%m-%d').tolist()
    hist_values = series.values.tolist()
    
    fore_dates = forecast_mean.index.strftime('%Y-%m-%d').tolist()
    fore_values = np.round(forecast_mean.values, 2).tolist()
    
    lower_bounds = np.round(conf_int[lower_col].values, 2).tolist()
    upper_bounds = np.round(conf_int[upper_col].values, 2).tolist()
    
    # Summary of the model
    model_summary = {
        "order": [p, d, q],
        "aic": float(np.round(model_fit.aic, 2)) if hasattr(model_fit, 'aic') else None,
        "bic": float(np.round(model_fit.bic, 2)) if hasattr(model_fit, 'bic') else None,
        "is_auto": is_auto,
        "parameters": {name: float(val) for name, val in model_fit.params.items()}
    }
    
    # Qualitative interpretation of forecast trends
    last_hist = hist_values[-1]
    last_fore = fore_values[-1]
    pct_change = ((last_fore - last_hist) / last_hist * 100) if last_hist != 0 else 0
    
    # Calculate simple trend direction
    diff = last_fore - last_hist
    if abs(diff) < 0.01 * last_hist:
        trend_desc = "remain relatively stable"
    elif diff > 0:
        trend_desc = f"increase by approximately {abs(pct_change):.1f}%"
    else:
        trend_desc = f"decrease by approximately {abs(pct_change):.1f}%"
        
    interpretation = (
        f"The ARIMA({p},{d},{q}) model indicates that the parameter values are projected to "
        f"{trend_desc} over the next {steps} periods, moving from a final historical value of "
        f"{last_hist:.2f} to an estimated {last_fore:.2f} by {fore_dates[-1]}. The model was fitted "
        f"with AIC of {model_summary['aic']:.1f}."
    )
    
    return {
        "history": {
            "dates": hist_dates,
            "values": hist_values
        },
        "forecast": {
            "dates": fore_dates,
            "values": fore_values,
            "lower_bounds": lower_bounds,
            "upper_bounds": upper_bounds
        },
        "model_summary": model_summary,
        "interpretation": interpretation
    }

def generate_plot_base64(history_dates, history_values, forecast_dates, forecast_values, lower_bounds, upper_bounds, param_name, dark_mode=False):
    """
    Generates a matplotlib plot and encodes it as a base64 PNG string.
    """
    # Style setup
    if dark_mode:
        plt.style.use('dark_background')
        bg_color = '#1e1e2e'
        text_color = '#cdd6f4'
        hist_color = '#89b4fa'
        fore_color = '#f38ba8'
        ci_color = '#f38ba8'
        grid_color = '#313244'
    else:
        plt.style.use('default')
        bg_color = '#ffffff'
        text_color = '#1e1e2e'
        hist_color = '#2563eb'
        fore_color = '#dc2626'
        ci_color = '#dc2626'
        grid_color = '#e2e8f0'
        
    fig, ax = plt.subplots(figsize=(10, 5.5), facecolor=bg_color)
    ax.set_facecolor(bg_color)
    
    # Parse dates
    h_dates = pd.to_datetime(history_dates)
    f_dates = pd.to_datetime(forecast_dates)
    
    # Plot historical data
    ax.plot(h_dates, history_values, label='Historical Data', color=hist_color, linewidth=2, marker='o', markersize=4)
    
    # Plot forecast
    ax.plot(f_dates, forecast_values, label='ARIMA Forecast', color=fore_color, linewidth=2.5, linestyle='--', marker='s', markersize=4)
    
    # Plot confidence intervals
    ax.fill_between(f_dates, lower_bounds, upper_bounds, color=ci_color, alpha=0.15, label='95% Confidence Interval')
    
    # Title and labels
    ax.set_title(f'{param_name} - Historical and Forecasted Trends', fontsize=14, color=text_color, pad=15, fontweight='semibold')
    ax.set_xlabel('Timeline', fontsize=11, color=text_color, labelpad=10)
    ax.set_ylabel(param_name, fontsize=11, color=text_color, labelpad=10)
    
    ax.grid(True, linestyle=':', alpha=0.6, color=grid_color)
    ax.legend(facecolor=bg_color, edgecolor=grid_color, labelcolor=text_color)
    
    # Tick colors
    ax.tick_params(colors=text_color, labelsize=9)
    
    # Rotate date ticks
    plt.xticks(rotation=30)
    plt.tight_layout()
    
    # Save to buffer
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, facecolor=fig.get_facecolor(), edgecolor='none')
    plt.close(fig)
    buf.seek(0)
    
    # Encode base64
    base64_data = base64.b64encode(buf.read()).decode('utf-8')
    return f"data:image/png;base64,{base64_data}"

def generate_correlation_plot_base64(dates, param1_name, param1_values, param2_name, param2_values, dark_mode=False):
    """
    Generates a dual-axis correlation line chart using matplotlib in Python,
    saving it to a base64 encoded PNG.
    """
    # Color setup
    if dark_mode:
        plt.style.use('dark_background')
        bg_color = '#1e1e2e'
        text_color = '#cdd6f4'
        p1_color = '#89b4fa' # Blue
        p2_color = '#f5c2e7' # Pink
        grid_color = '#313244'
    else:
        plt.style.use('default')
        bg_color = '#ffffff'
        text_color = '#1e1e2e'
        p1_color = '#2563eb' # Indigo
        p2_color = '#db2777' # Dark pink
        grid_color = '#e2e8f0'
        
    fig, ax1 = plt.subplots(figsize=(10, 5.5), facecolor=bg_color)
    ax1.set_facecolor(bg_color)
    
    parsed_dates = pd.to_datetime(dates)
    
    # Primary axis (left)
    color = p1_color
    ax1.set_xlabel('Timeline', color=text_color, labelpad=10)
    ax1.set_ylabel(param1_name, color=color, fontweight='semibold')
    line1 = ax1.plot(parsed_dates, param1_values, color=color, linewidth=2, marker='o', markersize=4, label=param1_name)
    ax1.tick_params(axis='y', labelcolor=color)
    ax1.tick_params(colors=text_color, labelsize=9)
    ax1.grid(True, linestyle=':', alpha=0.6, color=grid_color)
    
    # Secondary axis (right)
    ax2 = ax1.twinx()
    color = p2_color
    ax2.set_ylabel(param2_name, color=color, fontweight='semibold')
    line2 = ax2.plot(parsed_dates, param2_values, color=color, linewidth=2, linestyle='--', marker='s', markersize=4, label=param2_name)
    ax2.tick_params(axis='y', labelcolor=color)
    ax2.tick_params(axis='both', which='major', labelsize=9)
    if dark_mode:
        ax2.spines['right'].set_color(grid_color)
        ax2.spines['left'].set_color(grid_color)
        ax2.spines['top'].set_color(grid_color)
        ax2.spines['bottom'].set_color(grid_color)
        
    # Title
    ax1.set_title(f'Correlation Analysis: {param1_name} vs {param2_name}', fontsize=14, pad=15, color=text_color, fontweight='bold')
    
    # Combine legends
    lines = line1 + line2
    labels = [l.get_label() for l in lines]
    ax1.legend(lines, labels, loc='upper left', facecolor=bg_color, edgecolor=grid_color, labelcolor=text_color)
    
    # Rotate ticks
    plt.setp(ax1.get_xticklabels(), rotation=30)
    plt.tight_layout()
    
    # Save to buffer
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, facecolor=fig.get_facecolor(), edgecolor='none')
    plt.close(fig)
    buf.seek(0)
    
    base64_data = base64.b64encode(buf.read()).decode('utf-8')
    return f"data:image/png;base64,{base64_data}"

