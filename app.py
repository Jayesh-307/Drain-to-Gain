from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import pandas as pd
import numpy as np
import os
import io

# Import forecasting functions
from forecaster import clean_and_validate_dataset, calculate_summary_statistics, perform_forecast, generate_plot_base64
from sample_generator import generate_sample_data

# Determine static folder dynamically (works both locally and on Render)
base_dir = os.path.dirname(os.path.abspath(__file__))
local_frontend = os.path.join(base_dir, '../frontend')
if os.path.exists(local_frontend):
    static_folder = local_frontend
else:
    static_folder = base_dir

app = Flask(__name__, static_folder=static_folder, static_url_path='')
CORS(app)

# Helper to find or generate sample data
def get_sample_data_path():
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    sample_path = os.path.join(backend_dir, "sample_data.csv")
    if not os.path.exists(sample_path):
        generate_sample_data()
    return sample_path

@app.route('/')
def index():
    """Serve index.html from frontend directory."""
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/api/sample-data', methods=['GET'])
def get_sample_data():
    """Reads the default sample dataset and returns data and summary statistics."""
    try:
        sample_path = get_sample_data_path()
        df = pd.read_csv(sample_path)
        
        cleaned_df, validation_warnings, date_col = clean_and_validate_dataset(df)
        if cleaned_df is None:
            return jsonify({"error": "Failed to load sample dataset: " + ", ".join(validation_warnings)}), 400
            
        # Structure the response
        response_data = {
            "columns": cleaned_df.columns.tolist(),
            "date_column": date_col,
            "dates": cleaned_df.index.strftime('%Y-%m-%d').tolist(),
            "data": cleaned_df.to_dict(orient='list'),
            "statistics": calculate_summary_statistics(cleaned_df),
            "warnings": validation_warnings
        }
        return jsonify(response_data)
    except Exception as e:
        return jsonify({"error": f"Internal Server Error: {str(e)}"}), 500

@app.route('/api/upload', methods=['POST'])
def upload_file():
    """Handles file uploads (CSV/Excel) and returns parsed data and summary statistics."""
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    try:
        filename = file.filename.lower()
        if filename.endswith('.csv'):
            df = pd.read_csv(file)
        elif filename.endswith(('.xls', '.xlsx')):
            df = pd.read_excel(file)
        else:
            return jsonify({"error": "Unsupported file format. Please upload CSV or Excel (.xls/.xlsx) files."}), 400
            
        cleaned_df, validation_warnings, date_col = clean_and_validate_dataset(df)
        if cleaned_df is None:
            return jsonify({"error": "Invalid dataset structure: " + ", ".join(validation_warnings)}), 400
            
        # Structure response
        response_data = {
            "columns": cleaned_df.columns.tolist(),
            "date_column": date_col,
            "dates": cleaned_df.index.strftime('%Y-%m-%d').tolist(),
            "data": cleaned_df.to_dict(orient='list'),
            "statistics": calculate_summary_statistics(cleaned_df),
            "warnings": validation_warnings
        }
        return jsonify(response_data)
        
    except Exception as e:
        return jsonify({"error": f"Failed to parse file: {str(e)}"}), 500

@app.route('/api/forecast', methods=['POST'])
def make_forecast():
    """
    Fits ARIMA model on selected parameter and returns forecast and base64 chart plot.
    JSON Body:
    {
        "dates": ["2021-01-01", ...],
        "values": [120.5, ...],
        "parameter": "Average Rainfall (mm)",
        "horizon": 12,
        "p": 1, "d": 1, "q": 1,  // optional, if not provided will use Auto-ARIMA
        "dark_mode": false
    }
    """
    body = request.get_json()
    if not body:
        return jsonify({"error": "Request body must be JSON"}), 400
        
    dates = body.get('dates')
    values = body.get('values')
    parameter = body.get('parameter')
    horizon = body.get('horizon', 12)
    dark_mode = body.get('dark_mode', False)
    
    # Optional ARIMA orders
    p = body.get('p')
    d = body.get('d')
    q = body.get('q')
    
    # Parse parameter values as integers or None
    try:
        p = int(p) if p is not None else None
        d = int(d) if d is not None else None
        q = int(q) if q is not None else None
        horizon = int(horizon)
    except ValueError:
        return jsonify({"error": "ARIMA parameters (p, d, q) and horizon must be integers."}), 400
        
    if not dates or not values or not parameter:
        return jsonify({"error": "Missing required fields: dates, values, and parameter"}), 400
        
    try:
        # Reconstruct series
        time_index = pd.to_datetime(dates)
        series = pd.Series(values, index=time_index, name=parameter)
        
        # Sort index
        series = series.sort_index()
        
        # Run forecast
        forecast_data = perform_forecast(series, steps=horizon, p=p, d=d, q=q)
        
        # Generate backend chart plot image
        plot_image = generate_plot_base64(
            history_dates=forecast_data["history"]["dates"],
            history_values=forecast_data["history"]["values"],
            forecast_dates=forecast_data["forecast"]["dates"],
            forecast_values=forecast_data["forecast"]["values"],
            lower_bounds=forecast_data["forecast"]["lower_bounds"],
            upper_bounds=forecast_data["forecast"]["upper_bounds"],
            param_name=parameter,
            dark_mode=dark_mode
        )
        
        forecast_data["plot_image"] = plot_image
        return jsonify(forecast_data)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Forecasting error: {str(e)}"}), 500

if __name__ == '__main__':
    # Bind to 0.0.0.0 and use PORT environment variable for hosting
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
