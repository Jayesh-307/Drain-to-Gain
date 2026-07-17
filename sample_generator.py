import pandas as pd
import numpy as np
import os

def generate_sample_data():
    # Set seed for reproducibility
    np.random.seed(42)
    
    # 5 years of monthly data: 2021-01-01 to 2025-12-01
    dates = pd.date_range(start="2021-01-01", end="2025-12-01", freq="MS")
    n = len(dates)
    
    # Monthly index for seasonality (1 to 12)
    months = dates.month
    
    # 1. Average Rainfall (mm): seasonal, peaking in June-August (months 6, 7, 8)
    # Base + seasonal sine wave + random noise
    base_rainfall = 80
    seasonal_rainfall = 120 * np.sin(2 * np.pi * (months - 4) / 12)
    noise_rainfall = np.random.normal(0, 15, n)
    rainfall = np.clip(base_rainfall + seasonal_rainfall + noise_rainfall, 5, 350)
    
    # 2. pH: stable around 7.2 with minor fluctuations
    ph = 7.2 + 0.15 * np.sin(2 * np.pi * months / 12) + np.random.normal(0, 0.1, n)
    ph = np.clip(ph, 6.0, 8.5)
    
    # 3. Turbidity (NTU): increases with rainfall runoff
    turbidity = 5.0 + 0.08 * rainfall + np.random.normal(0, 1.5, n)
    turbidity = np.clip(turbidity, 1.0, 50.0)
    
    # 4. Dissolved Oxygen (DO) (mg/L): seasonal (lower in summer, higher in winter)
    # Let's say winter is Dec-Feb (months 12, 1, 2)
    do = 8.5 + 1.5 * np.cos(2 * np.pi * (months - 1) / 12) + np.random.normal(0, 0.3, n)
    do = np.clip(do, 4.0, 14.0)
    
    # 5. Nitrates (mg/L): slight upward trend over the years + minor runoff correlation
    trend = np.linspace(0, 1.5, n)
    nitrates = 2.0 + trend + 0.005 * rainfall + np.random.normal(0, 0.2, n)
    nitrates = np.clip(nitrates, 0.1, 10.0)
    
    # Round values for cleanliness
    df = pd.DataFrame({
        "Date": dates.strftime("%Y-%m-%d"),
        "Average Rainfall (mm)": np.round(rainfall, 1),
        "pH": np.round(ph, 2),
        "Turbidity (NTU)": np.round(turbidity, 1),
        "Dissolved Oxygen (DO) (mg/L)": np.round(do, 2),
        "Nitrates (mg/L)": np.round(nitrates, 2)
    })
    
    # Create backend directory if it doesn't exist
    os.makedirs(os.path.dirname(__file__), exist_ok=True)
    
    output_path = os.path.join(os.path.dirname(__file__), "sample_data.csv")
    df.to_csv(output_path, index=False)
    print(f"Sample data generated successfully at: {output_path}")

if __name__ == "__main__":
    generate_sample_data()
