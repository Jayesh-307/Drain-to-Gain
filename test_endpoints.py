import unittest
import json
import os
import sys
import pandas as pd
import numpy as np

# Ensure backend directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import app, get_sample_data_path

class TestForecastingAPI(unittest.TestCase):
    
    def setUp(self):
        # Configure app for testing
        app.config['TESTING'] = True
        self.client = app.test_client()
        
    def test_sample_data_endpoint(self):
        """Test the sample data loader GET endpoint."""
        response = self.client.get('/api/sample-data')
        self.assertEqual(response.status_code, 200)
        
        data = json.loads(response.data)
        self.assertIn("columns", data)
        self.assertIn("data", data)
        self.assertIn("statistics", data)
        self.assertIn("date_column", data)
        
        # Verify specific parameters are present
        columns = data["columns"]
        self.assertIn("Average Rainfall (mm)", columns)
        self.assertIn("pH", columns)
        self.assertIn("Turbidity (NTU)", columns)
        self.assertIn("Dissolved Oxygen (DO) (mg/L)", columns)
        self.assertIn("Nitrates (mg/L)", columns)
        
        # Verify stats are populated
        stats = data["statistics"]
        self.assertIn("pH", stats)
        self.assertIn("mean", stats["pH"])
        self.assertIn("max", stats["pH"])

    def test_upload_missing_file(self):
        """Test upload endpoint handles missing file errors."""
        response = self.client.post('/api/upload')
        self.assertEqual(response.status_code, 400)
        
        data = json.loads(response.data)
        self.assertIn("error", data)

    def test_upload_invalid_file_type(self):
        """Test upload endpoint rejects non-spreadsheet files."""
        data = {
            'file': (open(__file__, 'rb'), 'test_endpoints.py') # Send the python test file as upload
        }
        response = self.client.post('/api/upload', data=data)
        self.assertEqual(response.status_code, 400)
        
        data = json.loads(response.data)
        self.assertIn("error", data)

    def test_arima_forecasting_endpoint(self):
        """Test the ARIMA forecasting post endpoint."""
        # Setup dummy request
        dates = [f"2023-{m:02d}-01" for m in range(1, 13)]
        # Rainfall pattern
        values = [50, 60, 45, 120, 200, 280, 260, 180, 100, 40, 20, 30]
        
        payload = {
            "dates": dates,
            "values": values,
            "parameter": "Average Rainfall (mm)",
            "horizon": 6,
            "p": 1,
            "d": 0,
            "q": 1,
            "dark_mode": False
        }
        
        response = self.client.post(
            '/api/forecast',
            data=json.dumps(payload),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        
        data = json.loads(response.data)
        self.assertIn("history", data)
        self.assertIn("forecast", data)
        self.assertIn("model_summary", data)
        self.assertIn("interpretation", data)
        self.assertIn("plot_image", data) # Base64 chart representation
        
        # Verify forecast lengths
        self.assertEqual(len(data["forecast"]["dates"]), 6)
        self.assertEqual(len(data["forecast"]["values"]), 6)
        self.assertEqual(len(data["forecast"]["lower_bounds"]), 6)
        self.assertEqual(len(data["forecast"]["upper_bounds"]), 6)
        
        # Verify model details
        self.assertEqual(data["model_summary"]["order"], [1, 0, 1])

if __name__ == '__main__':
    unittest.main()
