# Asset Processor GUI Dashboard

A modern desktop GUI for processing assets using CustomTkinter.

## Features

- **Real-time Stats**: See unprocessed and processed asset counts
- **Batch Processing**: Process all assets, 50 assets, or 10 assets at a time
- **Progress Tracking**: Visual progress bar and status updates
- **Log Output**: See processing logs in real-time
- **Dark Theme**: Modern, easy-on-the-eyes dark interface

## Installation

The GUI requires `customtkinter` which is already in `requirements.txt`:

```bash
pip install -r requirements.txt
```

## Usage

### Launch the GUI

```bash
python -m src.cli gui
```

Or directly:

```bash
python src/gui_dashboard.py
```

### Using the GUI

1. **View Stats**: The top section shows how many assets are unprocessed vs processed
2. **Process Assets**: 
   - Click "Process All Assets" to process everything
   - Click "Process 50 Assets" to process the first 50
   - Click "Process 10 Assets" to process the first 10
3. **Monitor Progress**: Watch the progress bar and log output
4. **Refresh Stats**: Click "Refresh Stats" to update the counts
5. **Clear Log**: Click "Clear Log" to clear the log textbox

## How It Works

- The GUI runs processing in a background thread so the interface stays responsive
- Processing uses the same `process_all_assets()` function as the CLI
- Rich terminal output will still appear in your terminal, while the GUI shows completion status
- Stats are automatically refreshed after processing completes

## Notes

- The GUI uses the same Supabase credentials from your environment variables
- Processing happens in the background - you can still interact with the GUI
- The terminal will show Rich-formatted progress (if you have a terminal open)
- The GUI log shows completion status and any errors
