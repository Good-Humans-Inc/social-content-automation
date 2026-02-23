"""
CustomTkinter GUI Dashboard for Asset Processor and Video Generation
"""
import sys
import os
from pathlib import Path
from dotenv import load_dotenv
from tkinter import filedialog, messagebox

# Add parent directory to path to allow imports
parent_dir = Path(__file__).parent.parent
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))

# Load .env file from project root
env_path = parent_dir / ".env"
load_dotenv(env_path)

import customtkinter as ctk
from src.supabase_client import ensure_supabase_client
from src.config import load_config, AppConfig
from src.templates import TemplateLibrary
from src.db_export import export_templates
from src.geelark_client import GeeLarkClient, GeeLarkError
from src.scheduler import get_scheduled_time
from datetime import datetime, timezone
import threading
import queue
import requests
import tempfile
from typing import Optional, List, Dict

# Set appearance mode and color theme
ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")


class UnifiedDashboardGUI(ctk.CTk):
    def __init__(self):
        super().__init__()
        
        self.title("GeeLark Automation Dashboard")
        self.geometry("1400x1000")
        # Make window resizable
        self.minsize(1200, 800)
        
        # Queue for thread-safe UI updates
        self.update_queue = queue.Queue()
        self.check_queue()
        
        # Processing state
        self.is_processing_videos = False
        
        # Video generation state
        self.config: Optional[AppConfig] = None
        self.template_library: Optional[TemplateLibrary] = None
        self.selected_image_paths: List[str] = []  # Store selected image paths for slideshow
        self.selected_video_image_paths: List[str] = []  # Store selected image paths for video generation
        self.selected_image_metadata: Dict[str, Dict] = {}  # Store metadata for each image path: {path: {subcategory, category, ...}}
        self.selected_character: Optional[str] = None  # Store selected character for carousel (deprecated, use selected_characters)
        
        self._create_widgets()
        self._load_config()
        
        # Initially show video section (default post type is "video")
        # Images section will be shown when slideshow is selected
    
    def _create_widgets(self):
        """Create and layout all GUI widgets."""
        # Title
        self.title_label = ctk.CTkLabel(
            self,
            text="GeeLark Automation Dashboard",
            font=ctk.CTkFont(size=28, weight="bold")
        )
        self.title_label.pack(pady=(20, 10))
        
        # Create tabview for different sections
        self.tabview = ctk.CTkTabview(self)
        self.tabview.pack(pady=10, padx=20, fill="both", expand=True)
        
        # Video Generation Tab
        self.video_tab = self.tabview.add("Video Generation")
        self._create_video_generation_tab()
        
        # GeeLark Posting Tab
        self.geelark_tab = self.tabview.add("GeeLark Posting")
        self._create_geelark_posting_tab()
    
    def check_queue(self):
        """Check for thread-safe UI updates from background threads."""
        try:
            while True:
                update = self.update_queue.get_nowait()
                if update['type'] == 'log':
                    self.log(update['message'])
                elif update['type'] == 'progress':
                    self.progress_bar.set(update['value'])
                    if 'message' in update:
                        self.progress_label.configure(text=update['message'])
                elif update['type'] == 'done':
                    self._enable_buttons()
                elif update['type'] == 'video_log':
                    level = update.get('level', 'INFO')
                    self.video_log(update['message'], level=level)
                elif update['type'] == 'video_progress':
                    self.video_progress_bar.set(update['value'])
                    if 'message' in update:
                        self.video_progress_label.configure(text=update['message'])
                elif update['type'] == 'video_done':
                    self.is_processing_videos = False
                    self.generate_btn.configure(state="normal")
                    self.video_progress_label.configure(text="Completed")
                    self.video_progress_bar.set(1.0)
                elif update['type'] == 'geelark_log':
                    level = update.get('level', 'INFO')
                    self.geelark_log(update['message'], level=level)
        except queue.Empty:
            pass
        finally:
            # Schedule next check
            self.after(100, self.check_queue)
    
    def _disable_buttons(self):
        """Disable all action buttons during processing."""
        pass  # No asset processing buttons to disable
    
    def _enable_buttons(self):
        """Enable all action buttons."""
        pass  # No asset processing buttons to enable
    
    def _create_video_generation_tab(self):
        """Create the video generation tab."""
        # Create a scrollable frame for the entire tab content
        scrollable_frame = ctk.CTkScrollableFrame(self.video_tab)
        scrollable_frame.pack(fill="both", expand=True, padx=10, pady=10)
        
        # Config section
        config_frame = ctk.CTkFrame(scrollable_frame)
        config_frame.pack(pady=10, padx=20, fill="x")
        
        ctk.CTkLabel(
            config_frame,
            text="Configuration",
            font=ctk.CTkFont(size=16, weight="bold")
        ).pack(pady=(10, 5))
        
        config_inner = ctk.CTkFrame(config_frame)
        config_inner.pack(pady=10, padx=10, fill="x")
        
        self.config_path_label = ctk.CTkLabel(
            config_inner,
            text="Config: Not loaded",
            font=ctk.CTkFont(size=12)
        )
        self.config_path_label.pack(side="left", padx=10)
        
        self.load_config_btn = ctk.CTkButton(
            config_inner,
            text="Load Config",
            command=self._load_config_dialog,
            width=120,
            height=30
        )
        self.load_config_btn.pack(side="left", padx=10)
        
        self.export_templates_btn = ctk.CTkButton(
            config_inner,
            text="Export Templates from DB",
            command=self._export_templates,
            width=180,
            height=30
        )
        self.export_templates_btn.pack(side="left", padx=10)
        
        # Post type selection
        post_type_frame = ctk.CTkFrame(scrollable_frame)
        post_type_frame.pack(pady=10, padx=20, fill="x")
        
        ctk.CTkLabel(
            post_type_frame,
            text="Post Type",
            font=ctk.CTkFont(size=16, weight="bold")
        ).pack(pady=(10, 5))
        
        self.post_type_var = ctk.StringVar(value="video")
        self.video_radio = ctk.CTkRadioButton(
            post_type_frame,
            text="Video (overlay text on video)",
            variable=self.post_type_var,
            value="video",
            command=self._on_post_type_change
        )
        self.video_radio.pack(side="left", padx=20, pady=10)
        
        self.slideshow_radio = ctk.CTkRadioButton(
            post_type_frame,
            text="Slideshow (images with text)",
            variable=self.post_type_var,
            value="slideshow",
            command=self._on_post_type_change
        )
        self.slideshow_radio.pack(side="left", padx=20, pady=10)
        
        self.carousel_radio = ctk.CTkRadioButton(
            post_type_frame,
            text="Carousel (character grid)",
            variable=self.post_type_var,
            value="carousel",
            command=self._on_post_type_change
        )
        self.carousel_radio.pack(side="left", padx=20, pady=10)
        
        # Video source section
        self.video_source_frame = ctk.CTkFrame(scrollable_frame)
        self.video_source_frame.pack(pady=10, padx=20, fill="x")
        
        ctk.CTkLabel(
            self.video_source_frame,
            text="Video Source",
            font=ctk.CTkFont(size=14, weight="bold")
        ).pack(pady=(10, 5))
        
        # Video source type selection (Base Video or Multiple Images)
        video_source_type_frame = ctk.CTkFrame(self.video_source_frame)
        video_source_type_frame.pack(pady=5, padx=10, fill="x")
        
        self.video_source_type_var = ctk.StringVar(value="base_video")
        self.base_video_radio = ctk.CTkRadioButton(
            video_source_type_frame,
            text="Base Video File",
            variable=self.video_source_type_var,
            value="base_video",
            command=self._on_video_source_type_change
        )
        self.base_video_radio.pack(side="left", padx=20, pady=5)
        
        self.video_images_radio = ctk.CTkRadioButton(
            video_source_type_frame,
            text="Multiple Images",
            variable=self.video_source_type_var,
            value="multiple_images",
            command=self._on_video_source_type_change
        )
        self.video_images_radio.pack(side="left", padx=20, pady=5)
        
        # Base video file section
        self.base_video_frame = ctk.CTkFrame(self.video_source_frame)
        self.base_video_frame.pack(pady=10, padx=10, fill="x")
        
        video_path_inner = ctk.CTkFrame(self.base_video_frame)
        video_path_inner.pack(pady=10, padx=10, fill="x")
        
        self.video_path_var = ctk.StringVar(value="")
        self.video_path_entry = ctk.CTkEntry(
            video_path_inner,
            textvariable=self.video_path_var,
            width=500,
            placeholder_text="Select base video file..."
        )
        self.video_path_entry.pack(side="left", padx=10)
        
        self.browse_video_btn = ctk.CTkButton(
            video_path_inner,
            text="Browse",
            command=self._browse_video,
            width=100
        )
        self.browse_video_btn.pack(side="left", padx=10)
        
        self.generate_video_btn = ctk.CTkButton(
            video_path_inner,
            text="Generate Base Video",
            command=self._show_generate_video_dialog,
            width=150,
            height=30
        )
        self.generate_video_btn.pack(side="left", padx=10)
        
        # Video images section (hidden by default)
        self.video_images_frame = ctk.CTkFrame(self.video_source_frame)
        # Don't pack it initially - it will be shown/hidden based on video source type
        
        ctk.CTkLabel(
            self.video_images_frame,
            text="Video Images (text overlay will be in the middle)",
            font=ctk.CTkFont(size=12)
        ).pack(pady=(10, 5))
        
        video_images_inner = ctk.CTkFrame(self.video_images_frame)
        video_images_inner.pack(pady=10, padx=10, fill="x")
        
        ctk.CTkLabel(video_images_inner, text="Images:").pack(side="left", padx=10)
        
        # Video image count display
        self.video_images_count_label = ctk.CTkLabel(
            video_images_inner,
            text="0 images selected",
            font=ctk.CTkFont(size=12)
        )
        self.video_images_count_label.pack(side="left", padx=10)
        
        self.browse_video_images_btn = ctk.CTkButton(
            video_images_inner,
            text="Browse Images",
            command=self._browse_video_images,
            width=120,
            height=30
        )
        self.browse_video_images_btn.pack(side="right", padx=10)
        
        self.load_video_images_supabase_btn = ctk.CTkButton(
            video_images_inner,
            text="Load from Supabase",
            command=self._load_video_images_from_supabase,
            width=150,
            height=30
        )
        self.load_video_images_supabase_btn.pack(side="right", padx=10)
        
        # Image duration setting for video images
        image_duration_frame = ctk.CTkFrame(self.video_images_frame)
        image_duration_frame.pack(pady=5, padx=10, fill="x")
        
        ctk.CTkLabel(
            image_duration_frame,
            text="Image Duration (seconds):",
            font=ctk.CTkFont(size=12)
        ).pack(side="left", padx=10)
        
        self.image_duration_var = ctk.StringVar(value="3.0")
        self.image_duration_entry = ctk.CTkEntry(
            image_duration_frame,
            textvariable=self.image_duration_var,
            width=100
        )
        self.image_duration_entry.pack(side="left", padx=10)
        
        # Rapid mode checkbox
        self.rapid_mode_var = ctk.BooleanVar(value=False)
        self.rapid_mode_checkbox = ctk.CTkCheckBox(
            image_duration_frame,
            text="Rapid Mode (0.2s per image, static text)",
            variable=self.rapid_mode_var,
            font=ctk.CTkFont(size=12)
        )
        self.rapid_mode_checkbox.pack(side="left", padx=20)
        
        # Video images list display (similar to slideshow images)
        self.video_images_list_frame = ctk.CTkScrollableFrame(self.video_images_frame, height=150)
        self.video_images_list_frame.pack(pady=10, padx=10, fill="both", expand=True)
        
        # Images source section (hidden by default, shown when slideshow is selected)
        self.images_source_frame = ctk.CTkFrame(scrollable_frame)
        # Don't pack it initially - it will be shown/hidden based on post type
        
        ctk.CTkLabel(
            self.images_source_frame,
            text="Image Selection",
            font=ctk.CTkFont(size=16, weight="bold")
        ).pack(pady=(10, 5))
        
        images_inner = ctk.CTkFrame(self.images_source_frame)
        images_inner.pack(pady=10, padx=10, fill="x")
        
        ctk.CTkLabel(images_inner, text="Images:").pack(side="left", padx=10)
        
        # Image count display
        self.images_count_label = ctk.CTkLabel(
            images_inner,
            text="0 images selected",
            font=ctk.CTkFont(size=12)
        )
        self.images_count_label.pack(side="left", padx=10)
        
        self.browse_images_btn = ctk.CTkButton(
            images_inner,
            text="Browse Images",
            command=self._browse_images,
            width=120,
            height=30
        )
        self.browse_images_btn.pack(side="right", padx=10)
        
        self.load_supabase_btn = ctk.CTkButton(
            images_inner,
            text="Load from Supabase",
            command=self._load_images_from_supabase,
            width=150,
            height=30
        )
        self.load_supabase_btn.pack(side="right", padx=10)
        
        # Image list display (scrollable)
        images_list_frame = ctk.CTkFrame(self.images_source_frame)
        images_list_frame.pack(pady=10, padx=10, fill="both", expand=True)
        
        ctk.CTkLabel(
            images_list_frame,
            text="Selected Images:",
            font=ctk.CTkFont(size=12, weight="bold")
        ).pack(pady=(5, 5))
        
        self.images_listbox = ctk.CTkScrollableFrame(images_list_frame)
        self.images_listbox.pack(pady=5, padx=10, fill="both", expand=True)
        
        # selected_image_paths is initialized in __init__
        
        images_help = ctk.CTkLabel(
            self.images_source_frame,
            text="Number of images must match template overlay lines. Use 'Browse Images' for local files or 'Load from Supabase' for database images.",
            font=ctk.CTkFont(size=11),
            text_color="gray"
        )
        images_help.pack(pady=(0, 10), padx=10)
        
        # Character selection frame (for carousel mode)
        self.character_selection_frame = ctk.CTkFrame(scrollable_frame)
        # Don't pack it initially - it will be shown/hidden based on post type
        
        ctk.CTkLabel(
            self.character_selection_frame,
            text="Character Selection (for carousel)",
            font=ctk.CTkFont(size=14, weight="bold")
        ).pack(pady=(10, 5))
        
        # LADS characters list organized by groups
        lads_characters = {
            'Main Characters': ['xavier', 'zayne', 'rafayel', 'caleb', 'sylus'],
            'Supporting Characters': [
                'aislinn', 'andrew', 'benedict', 'carter', 'dimitri', 'noah', 'gideon', 'greyson',
                'jenna', 'jeremiah', 'josephine', 'kevi', 'leon', 'luke', 'kieran', 'lumiere',
                'mephisto', 'nero', 'otto', 'philip', 'player', 'lucius', 'raymond', 'riley',
                'simone', 'soren', 'talia', 'tara', 'thomas', 'ulysses', 'viper', 'yvonne'
            ]
        }
        
        # Create scrollable frame for character selection
        character_scroll = ctk.CTkScrollableFrame(self.character_selection_frame, height=200)
        character_scroll.pack(pady=10, padx=10, fill="both", expand=True)
        
        # Store selected characters
        self.selected_characters = {}  # {character_name: ctk.BooleanVar}
        
        # Create checkboxes for each character group
        for group_name, characters in lads_characters.items():
            group_label = ctk.CTkLabel(
                character_scroll,
                text=group_name,
                font=ctk.CTkFont(size=12, weight="bold")
            )
            group_label.pack(pady=(10, 5), anchor="w")
            
            # Create a frame for character checkboxes in this group
            char_group_frame = ctk.CTkFrame(character_scroll)
            char_group_frame.pack(pady=5, padx=10, fill="x")
            
            # Arrange characters in a grid (3 columns)
            row = 0
            col = 0
            for char_name in characters:
                var = ctk.BooleanVar(value=False)
                self.selected_characters[char_name] = var
                
                checkbox = ctk.CTkCheckBox(
                    char_group_frame,
                    text=char_name.capitalize(),
                    variable=var,
                    font=ctk.CTkFont(size=11)
                )
                checkbox.grid(row=row, column=col, padx=10, pady=5, sticky="w")
                
                col += 1
                if col >= 3:
                    col = 0
                    row += 1
        
        # Selection info and buttons
        selection_info_frame = ctk.CTkFrame(self.character_selection_frame)
        selection_info_frame.pack(pady=10, padx=10, fill="x")
        
        self.character_count_label = ctk.CTkLabel(
            selection_info_frame,
            text="Selected: 0 characters",
            font=ctk.CTkFont(size=12)
        )
        self.character_count_label.pack(side="left", padx=10)
        
        def update_character_count(*args):
            count = sum(1 for var in self.selected_characters.values() if var.get())
            self.character_count_label.configure(text=f"Selected: {count} character(s)")
        
        # Set up trace for all checkboxes
        for var in self.selected_characters.values():
            var.trace("w", update_character_count)
        
        # Initial count update
        update_character_count()
        
        # Select all / Deselect all buttons
        select_all_btn = ctk.CTkButton(
            selection_info_frame,
            text="Select All",
            command=lambda: [var.set(True) for var in self.selected_characters.values()],
            width=100,
            height=30
        )
        select_all_btn.pack(side="right", padx=5)
        
        deselect_all_btn = ctk.CTkButton(
            selection_info_frame,
            text="Deselect All",
            command=lambda: [var.set(False) for var in self.selected_characters.values()],
            width=100,
            height=30
        )
        deselect_all_btn.pack(side="right", padx=5)
        
        carousel_help = ctk.CTkLabel(
            self.character_selection_frame,
            text="Select one or more characters. Images will be automatically matched to characters based on their subcategory metadata. Each character will get a separate carousel with images in multiples of 4 (4, 8, 12, etc.) for grid layout.",
            font=ctk.CTkFont(size=11),
            text_color="gray",
            wraplength=600
        )
        carousel_help.pack(pady=(0, 10), padx=10)
        
        # Template selection
        template_frame = ctk.CTkFrame(scrollable_frame)
        template_frame.pack(pady=10, padx=20, fill="x")
        
        ctk.CTkLabel(
            template_frame,
            text="Template Selection",
            font=ctk.CTkFont(size=16, weight="bold")
        ).pack(pady=(10, 5))
        
        template_inner = ctk.CTkFrame(template_frame)
        template_inner.pack(pady=10, padx=10, fill="x")
        
        ctk.CTkLabel(template_inner, text="Templates File:").pack(side="left", padx=10)
        self.template_path_var = ctk.StringVar(value="./input/templates.jsonl")
        self.template_path_entry = ctk.CTkEntry(
            template_inner,
            textvariable=self.template_path_var,
            width=300
        )
        self.template_path_entry.pack(side="left", padx=10)
        
        self.browse_template_btn = ctk.CTkButton(
            template_inner,
            text="Browse",
            command=self._browse_template,
            width=100
        )
        self.browse_template_btn.pack(side="left", padx=10)
        
        self.load_templates_btn = ctk.CTkButton(
            template_inner,
            text="Load Templates",
            command=self._load_templates,
            width=120
        )
        self.load_templates_btn.pack(side="left", padx=10)
        
        self.template_count_label = ctk.CTkLabel(
            template_inner,
            text="Templates: 0",
            font=ctk.CTkFont(size=12)
        )
        self.template_count_label.pack(side="left", padx=20)
        
        # Template selection dropdown
        template_select_frame = ctk.CTkFrame(template_frame)
        template_select_frame.pack(pady=10, padx=10, fill="x")
        
        ctk.CTkLabel(template_select_frame, text="Select Template:").pack(side="left", padx=10)
        
        self.template_var = ctk.StringVar(value="Auto-select")
        self.template_dropdown = ctk.CTkComboBox(
            template_select_frame,
            values=["Auto-select"],  # Will be populated when templates are loaded
            variable=self.template_var,
            width=400,
            state="readonly"
        )
        self.template_dropdown.pack(side="left", padx=10)
        
        template_help = ctk.CTkLabel(
            template_frame,
            text="Choose 'Auto-select' to let the system choose a template, or select a specific template from the list.",
            font=ctk.CTkFont(size=11),
            text_color="gray"
        )
        template_help.pack(pady=(0, 10), padx=10)
        
        # Generation options
        options_frame = ctk.CTkFrame(scrollable_frame)
        options_frame.pack(pady=10, padx=20, fill="x")
        
        ctk.CTkLabel(
            options_frame,
            text="Generation Options",
            font=ctk.CTkFont(size=16, weight="bold")
        ).pack(pady=(10, 5))
        
        options_inner = ctk.CTkFrame(options_frame)
        options_inner.pack(pady=10, padx=10, fill="x")
        
        ctk.CTkLabel(options_inner, text="Output Directory:").pack(side="left", padx=10)
        # Use absolute path relative to project root to avoid confusion
        default_output = str(parent_dir / "output")
        self.output_dir_var = ctk.StringVar(value=default_output)
        self.output_dir_entry = ctk.CTkEntry(
            options_inner,
            textvariable=self.output_dir_var,
            width=300
        )
        self.output_dir_entry.pack(side="left", padx=10)
        
        self.browse_output_btn = ctk.CTkButton(
            options_inner,
            text="Browse",
            command=self._browse_output,
            width=100
        )
        self.browse_output_btn.pack(side="left", padx=10)
        
        self.dry_run_var = ctk.BooleanVar(value=True)
        self.dry_run_check = ctk.CTkCheckBox(
            options_inner,
            text="Dry Run (no posting)",
            variable=self.dry_run_var
        )
        self.dry_run_check.pack(side="left", padx=20)
        
        # Action buttons
        action_frame = ctk.CTkFrame(scrollable_frame)
        action_frame.pack(pady=10, padx=20, fill="x")
        
        self.generate_btn = ctk.CTkButton(
            action_frame,
            text="Generate Videos",
            command=self._start_generation,
            width=200,
            height=40,
            font=ctk.CTkFont(size=14, weight="bold")
        )
        self.generate_btn.pack(side="left", padx=10)
        
        self.open_output_btn = ctk.CTkButton(
            action_frame,
            text="Open Output Folder",
            command=self._open_output_folder,
            width=150,
            height=40
        )
        self.open_output_btn.pack(side="left", padx=10)
        
        # Progress section for video generation
        self.video_progress_frame = ctk.CTkFrame(scrollable_frame)
        self.video_progress_frame.pack(pady=10, padx=20, fill="x")
        
        self.video_progress_label = ctk.CTkLabel(
            self.video_progress_frame,
            text="Ready",
            font=ctk.CTkFont(size=14)
        )
        self.video_progress_label.pack(pady=5)
        
        self.video_progress_bar = ctk.CTkProgressBar(self.video_progress_frame)
        self.video_progress_bar.pack(pady=10, padx=20, fill="x")
        self.video_progress_bar.set(0)
        
        # Store last generated video/carousel path for posting
        self.last_generated_output: Optional[str] = None
        self.last_post_type: Optional[str] = None
        
        # Log output for video generation - ALWAYS VISIBLE at the bottom
        self.video_log_frame = ctk.CTkFrame(scrollable_frame)
        self.video_log_frame.pack(pady=10, padx=20, fill="x")
        
        log_header = ctk.CTkFrame(self.video_log_frame)
        log_header.pack(pady=(10, 5), padx=10, fill="x")
        
        log_title = ctk.CTkLabel(
            log_header,
            text="Generation Log & Debug Output",
            font=ctk.CTkFont(size=16, weight="bold")
        )
        log_title.pack(side="left", padx=10)
        
        self.clear_video_log_btn = ctk.CTkButton(
            log_header,
            text="Clear Log",
            command=lambda: self.video_log_text.delete("1.0", "end"),
            width=100,
            height=30
        )
        self.clear_video_log_btn.pack(side="right", padx=10)
        
        self.video_log_text = ctk.CTkTextbox(
            self.video_log_frame,
            font=ctk.CTkFont(size=11, family="Consolas"),  # Monospace font for better log readability
            wrap="word",
            height=400  # Much taller log box
        )
        self.video_log_text.pack(fill="x", padx=10, pady=(0, 10))
    
    def _create_geelark_posting_tab(self):
        """Create the GeeLark posting tab."""
        # Create a scrollable frame for the entire tab content
        scrollable_frame = ctk.CTkScrollableFrame(self.geelark_tab)
        scrollable_frame.pack(fill="both", expand=True, padx=10, pady=10)
        
        # Title
        title_label = ctk.CTkLabel(
            scrollable_frame,
            text="Post to GeeLark",
            font=ctk.CTkFont(size=24, weight="bold")
        )
        title_label.pack(pady=(20, 10))
        
        # Config section
        config_frame = ctk.CTkFrame(scrollable_frame)
        config_frame.pack(pady=10, padx=20, fill="x")
        
        ctk.CTkLabel(
            config_frame,
            text="Configuration",
            font=ctk.CTkFont(size=16, weight="bold")
        ).pack(pady=(10, 5))
        
        config_inner = ctk.CTkFrame(config_frame)
        config_inner.pack(pady=10, padx=10, fill="x")
        
        self.geelark_config_label = ctk.CTkLabel(
            config_inner,
            text="Config: Not loaded",
            font=ctk.CTkFont(size=12)
        )
        self.geelark_config_label.pack(side="left", padx=10)
        
        # Auto-load config on startup
        self.after(100, self._load_config_for_geelark_tab)
        
        self.geelark_load_config_btn = ctk.CTkButton(
            config_inner,
            text="Load Config",
            command=self._load_config_dialog,
            width=120,
            height=30
        )
        self.geelark_load_config_btn.pack(side="left", padx=10)
        
        # Account selection
        account_frame = ctk.CTkFrame(scrollable_frame)
        account_frame.pack(pady=10, padx=20, fill="x")
        
        ctk.CTkLabel(
            account_frame,
            text="Account Selection",
            font=ctk.CTkFont(size=16, weight="bold")
        ).pack(pady=(10, 5))
        
        account_inner = ctk.CTkFrame(account_frame)
        account_inner.pack(pady=10, padx=10, fill="x")
        
        ctk.CTkLabel(account_inner, text="Account:", font=ctk.CTkFont(size=14)).pack(side="left", padx=10)
        self.geelark_account_var = ctk.StringVar(value="")
        self.geelark_account_dropdown = ctk.CTkComboBox(
            account_inner,
            variable=self.geelark_account_var,
            values=[""],
            width=300,
            height=35
        )
        self.geelark_account_dropdown.pack(side="left", padx=10, fill="x", expand=True)
        
        # File selection
        file_frame = ctk.CTkFrame(scrollable_frame)
        file_frame.pack(pady=10, padx=20, fill="x")
        
        ctk.CTkLabel(
            file_frame,
            text="Video/Carousel File",
            font=ctk.CTkFont(size=16, weight="bold")
        ).pack(pady=(10, 5))
        
        file_inner = ctk.CTkFrame(file_frame)
        file_inner.pack(pady=10, padx=10, fill="x")
        
        self.geelark_file_var = ctk.StringVar(value="")
        file_entry = ctk.CTkEntry(
            file_inner,
            textvariable=self.geelark_file_var,
            width=400,
            height=35,
            placeholder_text="Select video file or carousel directory..."
        )
        file_entry.pack(side="left", padx=10, fill="x", expand=True)
        
        def browse_file():
            filename = filedialog.askopenfilename(
                title="Select Video File",
                filetypes=[("Video files", "*.mp4 *.mov *.avi"), ("All files", "*.*")]
            )
            if filename:
                self.geelark_file_var.set(filename)
        
        def browse_directory():
            dirname = filedialog.askdirectory(title="Select Carousel Directory")
            if dirname:
                self.geelark_file_var.set(dirname)
        
        ctk.CTkButton(
            file_inner,
            text="Browse File",
            command=browse_file,
            width=120,
            height=35
        ).pack(side="left", padx=5)
        
        ctk.CTkButton(
            file_inner,
            text="Browse Dir",
            command=browse_directory,
            width=120,
            height=35
        ).pack(side="left", padx=5)
        
        # Use last generated button
        def use_last_generated():
            if self.last_generated_output and os.path.exists(self.last_generated_output):
                self.geelark_file_var.set(self.last_generated_output)
                self.geelark_log(f"Using last generated: {self.last_generated_output}")
            else:
                messagebox.showinfo("Info", "No recently generated video/carousel found. Please generate one first or browse for a file.")
        
        use_last_btn = ctk.CTkButton(
            file_inner,
            text="Use Last Generated",
            command=use_last_generated,
            width=150,
            height=35,
            fg_color=("#10b981", "#059669")
        )
        use_last_btn.pack(side="left", padx=5)
        
        # Caption input
        caption_frame = ctk.CTkFrame(scrollable_frame)
        caption_frame.pack(pady=10, padx=20, fill="x")
        
        ctk.CTkLabel(
            caption_frame,
            text="Caption",
            font=ctk.CTkFont(size=16, weight="bold")
        ).pack(pady=(10, 5))
        
        caption_inner = ctk.CTkFrame(caption_frame)
        caption_inner.pack(pady=10, padx=10, fill="both", expand=True)
        
        self.geelark_caption_text = ctk.CTkTextbox(
            caption_inner,
            height=100,
            wrap="word"
        )
        self.geelark_caption_text.pack(fill="both", expand=True, padx=10, pady=10)
        
        # Schedule options
        schedule_frame = ctk.CTkFrame(scrollable_frame)
        schedule_frame.pack(pady=10, padx=20, fill="x")
        
        ctk.CTkLabel(
            schedule_frame,
            text="Schedule",
            font=ctk.CTkFont(size=16, weight="bold")
        ).pack(pady=(10, 5))
        
        schedule_inner = ctk.CTkFrame(schedule_frame)
        schedule_inner.pack(pady=10, padx=10, fill="x")
        
        ctk.CTkLabel(schedule_inner, text="Schedule (minutes from now):", font=ctk.CTkFont(size=14)).pack(side="left", padx=10)
        self.geelark_schedule_var = ctk.StringVar(value="120")
        schedule_entry = ctk.CTkEntry(schedule_inner, textvariable=self.geelark_schedule_var, width=100, height=35)
        schedule_entry.pack(side="left", padx=10)
        
        # Post button
        button_frame = ctk.CTkFrame(scrollable_frame)
        button_frame.pack(pady=20, padx=20)
        
        self.post_to_geelark_btn = ctk.CTkButton(
            button_frame,
            text="Post to GeeLark",
            command=self._post_to_geelark,
            width=250,
            height=50,
            font=ctk.CTkFont(size=18, weight="bold"),
            fg_color=("#3b82f6", "#2563eb")
        )
        self.post_to_geelark_btn.pack(padx=10)
        
        # Log output for GeeLark posting
        log_frame = ctk.CTkFrame(scrollable_frame)
        log_frame.pack(pady=10, padx=20, fill="both", expand=True)
        
        log_header = ctk.CTkFrame(log_frame)
        log_header.pack(pady=(10, 5), padx=10, fill="x")
        
        log_title = ctk.CTkLabel(
            log_header,
            text="Posting Log",
            font=ctk.CTkFont(size=16, weight="bold")
        )
        log_title.pack(side="left", padx=10)
        
        self.clear_geelark_log_btn = ctk.CTkButton(
            log_header,
            text="Clear Log",
            command=lambda: self.geelark_log_text.delete("1.0", "end"),
            width=100,
            height=30
        )
        self.clear_geelark_log_btn.pack(side="right", padx=10)
        
        self.geelark_log_text = ctk.CTkTextbox(
            log_frame,
            font=ctk.CTkFont(size=11, family="Consolas"),
            wrap="word",
            height=300
        )
        self.geelark_log_text.pack(fill="both", expand=True, padx=10, pady=(0, 10))
    
    def _on_post_type_change(self):
        """Show/hide appropriate source sections based on post type."""
        post_type = self.post_type_var.get()
        if post_type == "video":
            self.video_source_frame.pack(pady=10, padx=20, fill="x")
            self.images_source_frame.pack_forget()
            if hasattr(self, 'character_selection_frame'):
                self.character_selection_frame.pack_forget()
            # Show/hide video source type sections based on current selection
            self._on_video_source_type_change()
        elif post_type == "carousel":
            self.video_source_frame.pack_forget()
            self.images_source_frame.pack(pady=10, padx=20, fill="x")
            if hasattr(self, 'character_selection_frame'):
                self.character_selection_frame.pack(pady=10, padx=20, fill="x")
        else:  # slideshow
            self.video_source_frame.pack_forget()
            self.images_source_frame.pack(pady=10, padx=20, fill="x")
            if hasattr(self, 'character_selection_frame'):
                self.character_selection_frame.pack_forget()
    
    def _on_video_source_type_change(self):
        """Show/hide base video or video images section based on selection."""
        if not hasattr(self, 'video_source_type_var'):
            return
        
        source_type = self.video_source_type_var.get()
        if source_type == "base_video":
            self.base_video_frame.pack(pady=10, padx=10, fill="x")
            self.video_images_frame.pack_forget()
        else:  # multiple_images
            self.base_video_frame.pack_forget()
            self.video_images_frame.pack(pady=10, padx=10, fill="x")
            # Update display and force refresh
            self._update_video_images_display()
            self.update_idletasks()
            # Also update after a short delay to ensure it refreshes
            self.after(100, self._update_video_images_display)
    
    def _browse_video(self):
        """Browse for base video file."""
        filename = filedialog.askopenfilename(
            title="Select Base Video",
            filetypes=[("Video files", "*.mp4 *.mov *.avi"), ("All files", "*.*")]
        )
        if filename:
            self.video_path_var.set(filename)
    
    def _browse_images(self):
        """Browse for multiple image files."""
        filenames = filedialog.askopenfilenames(
            title="Select Image Files",
            filetypes=[("Image files", "*.jpg *.jpeg *.png *.webp *.gif"), ("All files", "*.*")]
        )
        if filenames:
            # Add to selected images list
            for filename in filenames:
                if filename not in self.selected_image_paths:
                    self.selected_image_paths.append(filename)
                    # Add basic metadata for local files (for display purposes)
                    if filename not in self.selected_image_metadata:
                        basename = os.path.basename(filename)
                        self.selected_image_metadata[filename] = {
                            'description': basename,
                            'subcategory': '',
                            'category': ''
                        }
            self._update_images_display()
    
    def _browse_video_images(self):
        """Browse for multiple image files for video generation."""
        filenames = filedialog.askopenfilenames(
            title="Select Image Files for Video",
            filetypes=[("Image files", "*.jpg *.jpeg *.png *.webp *.gif"), ("All files", "*.*")]
        )
        if filenames:
            # Add to selected video images list
            for filename in filenames:
                if filename not in self.selected_video_image_paths:
                    self.selected_video_image_paths.append(filename)
            self._update_video_images_display()
    
    def _load_video_images_from_supabase(self):
        """Load images from Supabase for video generation."""
        # Reuse the same dialog as slideshow images, but set flag for video
        self._load_images_from_supabase(is_for_video=True)
    
    def _update_video_images_display(self):
        """Update the display of selected video images."""
        try:
            # Clear existing widgets
            if hasattr(self, 'video_images_list_frame'):
                for widget in self.video_images_list_frame.winfo_children():
                    widget.destroy()
            
            # Update count label
            count = len(self.selected_video_image_paths)
            if hasattr(self, 'video_images_count_label'):
                self.video_images_count_label.configure(text=f"{count} images selected")
            
            # Display each image
            if not hasattr(self, 'video_images_list_frame'):
                return
            
            for i, image_path in enumerate(self.selected_video_image_paths):
                image_frame = ctk.CTkFrame(self.video_images_list_frame)
                image_frame.pack(pady=2, padx=5, fill="x")
                
                # Image name
                basename = os.path.basename(image_path)
                label = ctk.CTkLabel(
                    image_frame,
                    text=f"{i+1}. {basename}",
                    anchor="w"
                )
                label.pack(side="left", padx=10, fill="x", expand=True)
                
                # Remove button
                remove_btn = ctk.CTkButton(
                    image_frame,
                    text="Remove",
                    width=80,
                    height=25,
                    command=lambda idx=i: self._remove_video_image(idx)
                )
                remove_btn.pack(side="right", padx=5)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error updating video images display: {e}", exc_info=True)
            # At least update the count
            if hasattr(self, 'video_images_count_label'):
                count = len(self.selected_video_image_paths)
                self.video_images_count_label.configure(text=f"{count} images selected")
    
    def _remove_video_image(self, index: int):
        """Remove an image from the video images list."""
        if 0 <= index < len(self.selected_video_image_paths):
            self.selected_video_image_paths.pop(index)
            self._update_video_images_display()
    
    def _update_images_display(self):
        """Update the images list display."""
        # Clear existing display
        for widget in self.images_listbox.winfo_children():
            widget.destroy()
        
        # Display each selected image
        for i, image_path in enumerate(self.selected_image_paths):
            image_frame = ctk.CTkFrame(self.images_listbox)
            image_frame.pack(pady=2, padx=5, fill="x")
            
            # Try to get meaningful display name from metadata
            display_name = None
            metadata = self.selected_image_metadata.get(image_path, {})
            
            if metadata:
                # Priority: subcategory > description > category
                subcategory = metadata.get('subcategory', '')
                description = metadata.get('description', '')
                category = metadata.get('category', '')
                
                if subcategory:
                    display_name = f"{subcategory.capitalize()}"
                    if description:
                        # Add description if available (truncate if too long)
                        desc_short = description[:30] + "..." if len(description) > 30 else description
                        display_name += f" - {desc_short}"
                elif description:
                    display_name = description[:50] + "..." if len(description) > 50 else description
                elif category:
                    display_name = f"{category.capitalize()} image"
            
            # Fallback to filename if no metadata
            if not display_name:
                display_name = os.path.basename(image_path) if os.path.exists(image_path) else image_path
                # For temp files, try to make it shorter
                if display_name.startswith('tmp') and len(display_name) > 20:
                    display_name = f"Image {i+1}"
            
            # Truncate if still too long
            if len(display_name) > 60:
                display_name = display_name[:57] + "..."
            
            # Create label with image info
            label_text = f"{i+1}. {display_name}"
            image_label = ctk.CTkLabel(
                image_frame,
                text=label_text,
                font=ctk.CTkFont(size=11)
            )
            image_label.pack(side="left", padx=10)
            
            # Add metadata info as tooltip-like text (smaller, gray)
            if metadata:
                info_parts = []
                if metadata.get('category'):
                    info_parts.append(metadata.get('category'))
                if metadata.get('subcategory') and metadata.get('subcategory') not in display_name.lower():
                    info_parts.append(metadata.get('subcategory'))
                
                if info_parts:
                    info_text = " | ".join(info_parts)
                    info_label = ctk.CTkLabel(
                        image_frame,
                        text=info_text,
                        font=ctk.CTkFont(size=9),
                        text_color="gray"
                    )
                    info_label.pack(side="left", padx=5)
            
            # Remove button
            def remove_image(idx=i, path=image_path):
                if idx < len(self.selected_image_paths):
                    self.selected_image_paths.pop(idx)
                    # Also remove metadata if exists
                    if path in self.selected_image_metadata:
                        del self.selected_image_metadata[path]
                    self._update_images_display()
            
            ctk.CTkButton(
                image_frame,
                text="Remove",
                command=remove_image,
                width=80,
                height=25,
                font=ctk.CTkFont(size=10)
            ).pack(side="right", padx=5)
        
        # Update count
        self.images_count_label.configure(text=f"{len(self.selected_image_paths)} images selected")
    
    def _load_images_from_supabase(self, is_for_video: bool = False):
        """Load and select images from Supabase Storage."""
        try:
            supabase = ensure_supabase_client()
            
            # Fetch assets from Supabase
            self.video_log("Fetching assets from Supabase...", level="DEBUG")
            result = supabase.table('assets').select('id,url,storage_path,metadata,fandom,tags').limit(100).order('created_at', desc=True).execute()
            assets = result.data if hasattr(result, 'data') else []
            
            if not assets:
                messagebox.showinfo("Info", "No assets found in Supabase")
                return
            
            # Create a selection dialog
            self._show_asset_selector(assets, is_for_video=is_for_video)
            
        except Exception as e:
            messagebox.showerror("Error", f"Failed to load assets from Supabase: {e}")
            self.video_log(f"✗ Error loading assets: {e}")
    
    def _show_asset_selector(self, assets: List[Dict], is_for_video: bool = False):
        """Show a dialog to select assets from Supabase."""
        # Create a new window for asset selection
        selector_window = ctk.CTkToplevel(self)
        selector_window.title("Select Images from Supabase")
        selector_window.geometry("900x700")
        
        # Info label
        info_label = ctk.CTkLabel(
            selector_window,
            text=f"Found {len(assets)} assets. Select images to download and use.",
            font=ctk.CTkFont(size=12)
        )
        info_label.pack(pady=10)
        
        # Filter/search frame
        filter_frame = ctk.CTkFrame(selector_window)
        filter_frame.pack(pady=10, padx=20, fill="x")
        
        # Category filter
        ctk.CTkLabel(filter_frame, text="Category:").pack(side="left", padx=10)
        category_var = ctk.StringVar(value="all")
        # Extract categories from metadata
        categories = set()
        for a in assets:
            metadata = a.get('metadata', {}) or {}
            if isinstance(metadata, dict):
                cat = metadata.get('category', '')
                if cat:
                    categories.add(cat)
        category_menu = ctk.CTkOptionMenu(
            filter_frame,
            variable=category_var,
            values=["all"] + sorted(list(categories)),
            width=150
        )
        category_menu.pack(side="left", padx=10)
        
        # Subcategory filter
        ctk.CTkLabel(filter_frame, text="Subcategory:").pack(side="left", padx=10)
        subcategory_var = ctk.StringVar(value="all")
        # Extract all subcategories from metadata (will be filtered by category)
        all_subcategories = set()
        subcategories_by_category = {}  # {category: set of subcategories}
        for a in assets:
            metadata = a.get('metadata', {}) or {}
            cat = ''
            subcat = ''
            
            if isinstance(metadata, dict):
                cat = metadata.get('category', '')
                subcat = metadata.get('subcategory', '')
            
            # Also check direct category/subcategory fields if not in metadata
            if not cat and a.get('category'):
                cat = a.get('category', '')
            if not subcat and a.get('subcategory'):
                subcat = a.get('subcategory', '')
            
            if subcat:
                all_subcategories.add(subcat)
                if cat:
                    if cat not in subcategories_by_category:
                        subcategories_by_category[cat] = set()
                    subcategories_by_category[cat].add(subcat)
                else:
                    # If no category, add to a special "uncategorized" group
                    if "uncategorized" not in subcategories_by_category:
                        subcategories_by_category["uncategorized"] = set()
                    subcategories_by_category["uncategorized"].add(subcat)
        
        subcategory_menu = ctk.CTkOptionMenu(
            filter_frame,
            variable=subcategory_var,
            values=["all"] + sorted(list(all_subcategories)),
            width=150
        )
        subcategory_menu.pack(side="left", padx=10)
        
        def update_subcategory_filter(*args):
            """Update subcategory dropdown based on selected category."""
            selected_category = category_var.get()
            if selected_category == "all":
                # Show all subcategories
                available_subcats = sorted(list(all_subcategories))
            else:
                # Show only subcategories for selected category
                available_subcats = sorted(list(subcategories_by_category.get(selected_category, set())))
            
            # Update dropdown values
            subcategory_menu.configure(values=["all"] + available_subcats)
            # Reset to "all" if current selection is not available
            current_subcat = subcategory_var.get()
            if current_subcat != "all" and current_subcat not in available_subcats:
                subcategory_var.set("all")
        
        # Update subcategory filter when category changes
        category_var.trace("w", update_subcategory_filter)
        
        # Scrollable frame for assets
        scroll_frame = ctk.CTkScrollableFrame(selector_window)
        scroll_frame.pack(pady=10, padx=20, fill="both", expand=True)
        
        selected_assets = []
        asset_checkboxes = {}
        asset_frames = {}
        
        def toggle_asset(asset_id, url):
            if asset_id in selected_assets:
                selected_assets.remove(asset_id)
            else:
                selected_assets.append(asset_id)
            update_selection_count()
        
        def update_selection_count():
            count_label.configure(text=f"Selected: {len(selected_assets)}")
            download_btn.configure(text=f"Download & Add ({len(selected_assets)})")
        
        def filter_assets():
            category = category_var.get()
            subcategory = subcategory_var.get()
            for asset_id, frame in asset_frames.items():
                asset = next((a for a in assets if a['id'] == asset_id), None)
                if not asset:
                    continue
                # Extract category and subcategory from metadata
                metadata = asset.get('metadata', {}) or {}
                asset_category = metadata.get('category', '') if isinstance(metadata, dict) else ''
                asset_subcategory = metadata.get('subcategory', '') if isinstance(metadata, dict) else ''
                # Also check direct subcategory field
                if not asset_subcategory and asset.get('subcategory'):
                    asset_subcategory = asset.get('subcategory', '')
                
                # Check if asset matches filters
                category_match = (category == "all" or asset_category == category)
                subcategory_match = (subcategory == "all" or asset_subcategory == subcategory)
                
                if category_match and subcategory_match:
                    frame.pack(pady=5, padx=10, fill="x")
                else:
                    frame.pack_forget()
        
        category_var.trace("w", lambda *args: filter_assets())
        subcategory_var.trace("w", lambda *args: filter_assets())
        
        # Display assets
        for asset in assets:
            asset_frame = ctk.CTkFrame(scroll_frame)
            asset_frame.pack(pady=5, padx=10, fill="x")
            asset_frames[asset['id']] = asset_frame
            
            # Extract description from metadata if available
            metadata = asset.get('metadata', {}) or {}
            description = metadata.get('description', '') if isinstance(metadata, dict) else ''
            if not description and asset.get('fandom'):
                description = f"Fandom: {asset['fandom']}"
            
            display_text = description[:40] + "..." if description and len(description) > 40 else (description or f"Image {asset['id'][:8]}")
            
            checkbox = ctk.CTkCheckBox(
                asset_frame,
                text=display_text,
                command=lambda aid=asset['id'], url=asset['url']: toggle_asset(aid, url)
            )
            checkbox.pack(side="left", padx=10)
            
            # Extract category, subcategory and dimensions from metadata
            category = metadata.get('category', '') if isinstance(metadata, dict) else ''
            subcategory = metadata.get('subcategory', '') if isinstance(metadata, dict) else ''
            # Also check direct subcategory field if metadata doesn't have it
            if not subcategory and asset.get('subcategory'):
                subcategory = asset.get('subcategory', '')
            width = metadata.get('width') if isinstance(metadata, dict) else None
            height = metadata.get('height') if isinstance(metadata, dict) else None
            
            info_text = f"Category: {category or 'N/A'}"
            if subcategory:
                info_text += f" | Subcategory: {subcategory}"
            if width and height:
                info_text += f" | {width}x{height}"
            elif asset.get('fandom'):
                info_text += f" | Fandom: {asset['fandom']}"
            
            info_label = ctk.CTkLabel(
                asset_frame,
                text=info_text,
                font=ctk.CTkFont(size=11)
            )
            info_label.pack(side="left", padx=10)
            
            asset_checkboxes[asset['id']] = checkbox
        
        # Action buttons frame
        action_frame = ctk.CTkFrame(selector_window)
        action_frame.pack(pady=10, padx=20, fill="x")
        
        count_label = ctk.CTkLabel(
            action_frame,
            text="Selected: 0",
            font=ctk.CTkFont(size=14, weight="bold")
        )
        count_label.pack(side="left", padx=20)
        
        def download_and_add():
            if not selected_assets:
                messagebox.showwarning("Warning", "Please select at least one image")
                return
            
            # Download selected assets in background
            selector_window.destroy()
            self.video_log(f"Downloading {len(selected_assets)} images from Supabase...")
            
            # Pass is_for_video flag to the download thread
            thread = threading.Thread(target=self._download_assets_thread, args=(selected_assets, assets, is_for_video))
            thread.daemon = True
            thread.start()
        
        download_btn = ctk.CTkButton(
            action_frame,
            text="Download & Add (0)",
            command=download_and_add,
            width=200,
            height=40
        )
        download_btn.pack(side="left", padx=10)
        
        ctk.CTkButton(
            action_frame,
            text="Cancel",
            command=selector_window.destroy,
            width=100,
            height=40
        ).pack(side="left", padx=10)
    
    def _download_assets_thread(self, selected_asset_ids: List[str], all_assets: List[Dict], is_for_video: bool = False):
        """Background thread to download assets from Supabase."""
        downloaded_paths = []
        
        for asset_id in selected_asset_ids:
            asset = next((a for a in all_assets if a['id'] == asset_id), None)
            if not asset:
                continue
            
            try:
                url = asset['url']
                # Extract description from metadata
                metadata = asset.get('metadata', {}) or {}
                description = metadata.get('description', 'image') if isinstance(metadata, dict) else 'image'
                self.update_queue.put({
                    'type': 'video_log',
                    'message': f'Downloading: {description[:30]}...'
                })
                
                # Download image from Supabase Storage URL
                response = requests.get(url, timeout=30)
                response.raise_for_status()
                
                # Save to temp file
                ext = 'jpg'
                if '.' in url:
                    ext = url.split('.')[-1].split('?')[0].lower()
                    if ext not in ['jpg', 'jpeg', 'png', 'webp', 'gif']:
                        ext = 'jpg'
                
                temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=f'.{ext}')
                temp_file.write(response.content)
                temp_file.close()
                
                downloaded_paths.append(temp_file.name)
                # Extract and store metadata for this image
                metadata = asset.get('metadata', {}) or {}
                if isinstance(metadata, str):
                    try:
                        import json
                        metadata = json.loads(metadata)
                    except:
                        metadata = {}
                
                # Store metadata with image path
                self.selected_image_metadata[temp_file.name] = {
                    'subcategory': metadata.get('subcategory', '') if isinstance(metadata, dict) else '',
                    'category': metadata.get('category', '') if isinstance(metadata, dict) else '',
                    'description': metadata.get('description', 'image') if isinstance(metadata, dict) else 'image',
                }
                
                description = self.selected_image_metadata[temp_file.name]['description']
                self.update_queue.put({
                    'type': 'video_log',
                    'message': f'✓ Downloaded: {description[:30]}',
                    'level': 'SUCCESS'
                })
                
            except Exception as e:
                self.update_queue.put({
                    'type': 'video_log',
                    'message': f'✗ Failed to download {asset_id}: {e}',
                    'level': 'ERROR'
                })
        
        if downloaded_paths:
            # Add to images text area (must be done in main thread)
            # Use a closure to properly capture the variables
            paths_to_add = downloaded_paths.copy()  # Make a copy to avoid closure issues
            is_video = is_for_video  # Capture the flag
            
            def add_images():
                try:
                    import logging
                    logger = logging.getLogger(__name__)
                    self.video_log(f"Callback executing: Adding {len(paths_to_add)} images to {'video' if is_video else 'slideshow'} list")
                    logger.info(f"Callback executing: Adding {len(paths_to_add)} images to {'video' if is_video else 'slideshow'} list")
                    self._add_downloaded_images(paths_to_add, is_video)
                    # Force a refresh
                    if is_video:
                        count = len(self.selected_video_image_paths)
                        self.video_log(f"Video images list now has {count} images")
                        logger.info(f"After adding: Video images list now has {count} images")
                        # Force update the display multiple times to ensure it refreshes
                        self.update_idletasks()
                        self.update()
                        # Also try calling update again after a short delay
                        self.after(100, lambda: self._update_video_images_display() if hasattr(self, 'video_images_list_frame') else None)
                except Exception as e:
                    import logging
                    logger = logging.getLogger(__name__)
                    error_msg = f"Error in add_images callback: {e}"
                    self.video_log(error_msg, level="ERROR")
                    logger.error(error_msg, exc_info=True)
                    import traceback
                    logger.error(traceback.format_exc())
            
            self.after(0, add_images)
            self.update_queue.put({
                'type': 'video_log',
                'message': f'✓ Successfully downloaded {len(downloaded_paths)} images. Adding to list...',
                'level': 'SUCCESS'
            })
        else:
            self.update_queue.put({
                'type': 'video_log',
                'message': '✗ No images were downloaded',
                'level': 'ERROR'
            })
    
    def _add_downloaded_images(self, image_paths: List[str], is_for_video: bool = False):
        """Add downloaded images to the selected images list."""
        import logging
        logger = logging.getLogger(__name__)
        try:
            if is_for_video:
                logger.info(f"Adding {len(image_paths)} images to video images list (current count: {len(self.selected_video_image_paths)})")
                for path in image_paths:
                    if path not in self.selected_video_image_paths:
                        self.selected_video_image_paths.append(path)
                        logger.debug(f"Added image: {os.path.basename(path)}")
                
                logger.info(f"Video images list now contains {len(self.selected_video_image_paths)} images")
                
                # Always try to update display if widgets exist
                if hasattr(self, 'video_images_count_label'):
                    count = len(self.selected_video_image_paths)
                    logger.info(f"Updating count label to: {count} images selected")
                    self.video_images_count_label.configure(text=f"{count} images selected")
                    self.video_images_count_label.update_idletasks()
                
                if hasattr(self, 'video_images_list_frame'):
                    logger.info("Updating video images display")
                    self._update_video_images_display()
                else:
                    logger.warning("video_images_list_frame does not exist")
            else:
                for path in image_paths:
                    if path not in self.selected_image_paths:
                        self.selected_image_paths.append(path)
                self._update_images_display()
        except Exception as e:
            logger.error(f"Error adding downloaded images: {e}", exc_info=True)
            # Still try to update the count at least
            if is_for_video and hasattr(self, 'video_images_count_label'):
                count = len(self.selected_video_image_paths)
                self.video_images_count_label.configure(text=f"{count} images selected")
    
    def _show_generate_video_dialog(self):
        """Show dialog to generate a base video."""
        dialog = ctk.CTkToplevel(self)
        dialog.title("Generate Base Video")
        dialog.geometry("500x400")
        dialog.transient(self)  # Make it modal
        dialog.grab_set()  # Make it modal
        
        ctk.CTkLabel(
            dialog,
            text="Generate Background Video",
            font=ctk.CTkFont(size=20, weight="bold")
        ).pack(pady=20)
        
        # Output directory
        dir_frame = ctk.CTkFrame(dialog)
        dir_frame.pack(pady=20, padx=20, fill="x")
        
        ctk.CTkLabel(dir_frame, text="Save to:").pack(pady=5)
        
        output_dir_var = ctk.StringVar(value="./input/videos")
        dir_inner = ctk.CTkFrame(dir_frame)
        dir_inner.pack(pady=5, padx=10, fill="x")
        
        ctk.CTkEntry(dir_inner, textvariable=output_dir_var, width=300).pack(side="left", padx=10)
        
        def browse_dir():
            dirname = filedialog.askdirectory(title="Select Output Directory")
            if dirname:
                output_dir_var.set(dirname)
        
        ctk.CTkButton(dir_inner, text="Browse", command=browse_dir, width=100).pack(side="left")
        
        # Options
        options_frame = ctk.CTkFrame(dialog)
        options_frame.pack(pady=20, padx=20, fill="x")
        
        ctk.CTkLabel(options_frame, text="Number of videos:").pack(pady=5)
        count_var = ctk.StringVar(value="1")
        ctk.CTkEntry(options_frame, textvariable=count_var, width=100).pack(pady=5)
        
        # Generate button
        def generate_video():
            try:
                count = int(count_var.get())
                output_dir = output_dir_var.get()
                os.makedirs(output_dir, exist_ok=True)
                
                dialog.destroy()
                self.video_log(f"Generating {count} background video(s)...")
                
                # Run in background thread
                thread = threading.Thread(target=self._generate_video_thread, args=(count, output_dir))
                thread.daemon = True
                thread.start()
            except ValueError:
                messagebox.showerror("Error", "Please enter a valid number")
        
        button_frame = ctk.CTkFrame(dialog)
        button_frame.pack(pady=20)
        
        ctk.CTkButton(
            button_frame,
            text="Generate Video",
            command=generate_video,
            width=200,
            height=40,
            font=ctk.CTkFont(size=14, weight="bold")
        ).pack(side="left", padx=10)
        
        ctk.CTkButton(
            button_frame,
            text="Cancel",
            command=dialog.destroy,
            width=100,
            height=40
        ).pack(side="left", padx=10)
    
    def _generate_video_thread(self, count: int, output_dir: str):
        """Background thread to generate base videos."""
        try:
            from src.generate_pastel_backgrounds import main as generate_backgrounds
            import sys
            import os as os_module
            
            # Temporarily change output directory
            original_dir = os_module.getcwd()
            original_output = None
            
            # Modify the generate_pastel_backgrounds to use our output dir
            # Since we can't easily modify the script, we'll create a simple video generator
            self.update_queue.put({
                'type': 'video_log',
                'message': 'Generating background video...'
            })
            
            # Create a simple looping video using ffmpeg
            output_file = os.path.join(output_dir, "base_video.mp4")
            
            # Use ffmpeg to create a simple colored background video
            import subprocess
            
            # Create a 6-second video with a gradient background
            cmd = [
                "ffmpeg",
                "-y",
                "-f", "lavfi",
                "-i", f"color=c=0xE8D5FF:s=1080x1920:d=6",
                "-f", "lavfi",
                "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-crf", "18",
                "-c:a", "aac",
                "-shortest",
                "-pix_fmt", "yuv420p",
                output_file
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0 and os.path.exists(output_file):
                self.update_queue.put({
                    'type': 'video_log',
                    'message': f'✓ Generated base video: {output_file}'
                })
                # Auto-fill the video path
                self.after(0, lambda: self.video_path_var.set(output_file))
                self.update_queue.put({
                    'type': 'video_log',
                    'message': '✓ Video path automatically filled in'
                })
            else:
                self.update_queue.put({
                    'type': 'video_log',
                    'message': f'✗ Failed to generate video: {result.stderr}',
                    'level': 'ERROR'
                })
                
        except FileNotFoundError:
                self.update_queue.put({
                    'type': 'video_log',
                    'message': '✗ ffmpeg not found. Please install ffmpeg first.',
                    'level': 'ERROR'
                })
        except Exception as e:
                self.update_queue.put({
                    'type': 'video_log',
                    'message': f'✗ Error generating video: {e}',
                    'level': 'ERROR'
                })
    
    def _browse_template(self):
        """Browse for template JSONL file."""
        filename = filedialog.askopenfilename(
            title="Select Template File",
            filetypes=[("JSONL files", "*.jsonl"), ("All files", "*.*")]
        )
        if filename:
            self.template_path_var.set(filename)
    
    def _browse_output(self):
        """Browse for output directory."""
        dirname = filedialog.askdirectory(title="Select Output Directory")
        if dirname:
            self.output_dir_var.set(dirname)
    
    def _load_config_dialog(self):
        """Load config file via dialog."""
        filename = filedialog.askopenfilename(
            title="Select Config File",
            filetypes=[("YAML files", "*.yaml *.yml"), ("All files", "*.*")]
        )
        if filename:
            try:
                self.config = load_config(filename)
                self.config_path_label.configure(text=f"Config: {Path(filename).name}")
                self.video_log("✓ Loaded config from " + filename)
            except Exception as e:
                messagebox.showerror("Error", f"Failed to load config: {e}")
                self.video_log(f"✗ Error loading config: {e}", level="ERROR")
    
    def _load_config(self):
        """Try to load default config."""
        try:
            self.config = load_config()
            self.config_path_label.configure(text="Config: config.yaml (default)")
            self.video_log("✓ Loaded default config", level="SUCCESS")
            
            # Update GeeLark account dropdown
            if self.config and self.config.accounts:
                account_values = [f"{acc.id} - {acc.display_name}" for acc in self.config.accounts]
                if account_values:
                    self.geelark_account_dropdown.configure(values=account_values)
                    if not self.geelark_account_var.get():
                        self.geelark_account_var.set(account_values[0])
        except Exception as e:
            self.video_log(f"⚠ No config file found or error loading: {e}", level="WARNING")
    
    def _load_config_for_geelark_tab(self):
        """Load config and update GeeLark tab labels."""
        try:
            if not self.config:
                self.config = load_config()
            
            if self.config:
                # Update both config labels
                config_text = self.config_path_label.cget("text")
                if "Not loaded" not in config_text:
                    self.geelark_config_label.configure(text=config_text)
                else:
                    # Try to determine config path
                    config_path = _resolve_config_path(None)
                    if config_path:
                        config_name = os.path.basename(config_path)
                        config_dir = os.path.basename(os.path.dirname(config_path))
                        if config_dir == "src":
                            self.geelark_config_label.configure(text=f"Config: src/{config_name} (auto-loaded)")
                        else:
                            self.geelark_config_label.configure(text=f"Config: {config_name} (auto-loaded)")
                    else:
                        self.geelark_config_label.configure(text="Config: config.yaml (default)")
                
                # Update account dropdown if not already populated
                if self.config.accounts:
                    account_values = [f"{acc.id} - {acc.display_name}" for acc in self.config.accounts]
                    if account_values:
                        current_values = self.geelark_account_dropdown.cget("values")
                        if not current_values or current_values == [""]:
                            self.geelark_account_dropdown.configure(values=account_values)
                            if not self.geelark_account_var.get():
                                self.geelark_account_var.set(account_values[0])
        except Exception as e:
            # Silently fail - config might not exist yet
            pass
    
    def _export_templates(self):
        """Export templates from Supabase to JSONL."""
        try:
            output_path = self.template_path_var.get()
            if not output_path:
                output_path = "./input/templates.jsonl"
            
            self.video_log(f"Exporting templates to {output_path}...", level="INFO")
            count = export_templates(output_path=output_path, unused_only=True)
            self.video_log(f"✓ Exported {count} templates", level="SUCCESS")
            self.template_path_var.set(output_path)
            messagebox.showinfo("Success", f"Exported {count} templates to {output_path}")
        except Exception as e:
            self.video_log(f"✗ Error exporting templates: {e}", level="ERROR")
            messagebox.showerror("Error", f"Failed to export templates: {e}")
    
    def _load_templates(self):
        """Load templates from JSONL file."""
        template_path = self.template_path_var.get()
        if not template_path or not os.path.exists(template_path):
            messagebox.showerror("Error", "Template file not found")
            return
        
        try:
            self.template_library = TemplateLibrary.load(template_path)
            count = len(self.template_library.templates)
            self.template_count_label.configure(text=f"Templates: {count}")
            self.video_log(f"✓ Loaded {count} templates from {template_path}", level="SUCCESS")
            
            # Update GeeLark account dropdown if config is loaded
            if self.config and self.config.accounts:
                account_values = [f"{acc.id} - {acc.display_name}" for acc in self.config.accounts]
                if account_values:
                    self.geelark_account_dropdown.configure(values=account_values)
                    if not self.geelark_account_var.get():
                        self.geelark_account_var.set(account_values[0])
            
            # Populate template dropdown
            template_values = ["Auto-select"]
            for template in self.template_library.templates:
                # Show template ID and overlay preview
                overlay_preview = " | ".join(template.overlay[:2]) if template.overlay else "No overlay"
                if len(overlay_preview) > 50:
                    overlay_preview = overlay_preview[:47] + "..."
                template_display = f"{template.id} - {overlay_preview}"
                template_values.append(template_display)
            
            self.template_dropdown.configure(values=template_values)
            self.template_var.set("Auto-select")
            
        except Exception as e:
            messagebox.showerror("Error", f"Failed to load templates: {e}")
            self.video_log(f"✗ Error loading templates: {e}", level="ERROR")
    
    def _start_generation(self):
        """Start video generation."""
        if self.is_processing_videos:
            self.video_log("Already processing. Please wait...")
            return
        
        # Validate inputs
        if not self.config:
            messagebox.showerror("Error", "Please load a config file first")
            return
        
        if not self.template_library:
            messagebox.showerror("Error", "Please load templates first")
            return
        
        post_type = self.post_type_var.get()
        
        if post_type == "video":
            source_type = self.video_source_type_var.get() if hasattr(self, 'video_source_type_var') else "base_video"
            if source_type == "base_video":
                video_path = self.video_path_var.get()
                if not video_path or not os.path.exists(video_path):
                    messagebox.showerror("Error", "Please select a valid base video file")
                    return
            else:  # multiple_images
                video_image_paths = self.selected_video_image_paths.copy()
                if not video_image_paths:
                    messagebox.showerror(
                        "Error",
                        "Please select images for video generation.\n\n"
                        "You can:\n"
                        "1. Click 'Browse Images' to select local files\n"
                        "2. Click 'Load from Supabase' to select from database"
                    )
                    return
                
                # Validate image files exist
                video_image_paths = [img.strip() for img in video_image_paths if img.strip()]
                local_paths = [img for img in video_image_paths if not img.startswith('http')]
                missing_images = [img for img in local_paths if not os.path.exists(img)]
                if missing_images:
                    messagebox.showerror(
                        "Error",
                        f"The following image files were not found:\n\n" + "\n".join(missing_images[:5]) +
                        (f"\n... and {len(missing_images) - 5} more" if len(missing_images) > 5 else "")
                    )
                    return
        else:
            # Get images from selected_image_paths list
            image_paths = self.selected_image_paths.copy()
            
            if not image_paths:
                messagebox.showerror(
                    "Error", 
                    "Please select images for slideshow mode.\n\n"
                    "You can:\n"
                    "1. Click 'Browse Images' to select local files\n"
                    "2. Click 'Load from Supabase' to select from database\n\n"
                    "Number of images must match the number of overlay lines in your template."
                )
                self.update_queue.put({'type': 'video_done'})
                return
            
            # Validate image files exist
            image_paths = [img.strip() for img in image_paths if img.strip()]
            # Check if any are URLs (from Supabase) - these should already be downloaded
            # For now, just check local files
            local_paths = [img for img in image_paths if not img.startswith('http')]
            missing_images = [img for img in local_paths if not os.path.exists(img)]
            if missing_images:
                messagebox.showerror(
                    "Error",
                    f"The following image files were not found:\n\n" + "\n".join(missing_images[:5]) +
                    (f"\n... and {len(missing_images) - 5} more" if len(missing_images) > 5 else "")
                )
                return
        
        self.is_processing_videos = True
        self.generate_btn.configure(state="disabled")
        self.video_progress_bar.set(0)
        self.video_progress_label.configure(text="Starting...")
        
        # Run in thread
        thread = threading.Thread(target=self._generate_videos_thread)
        thread.daemon = True
        thread.start()
    
    def _generate_videos_thread(self):
        """Background thread for video generation."""
        try:
            from src.cli import _build_overlay_options, _render_video
            from src.slideshow_renderer import render_slideshow
            from src.video_overlay import create_video_from_images
            
            post_type = self.post_type_var.get()
            output_dir = self.output_dir_var.get()
            output_video = None  # Initialize output_video variable
            # Resolve relative paths to absolute (relative to project root)
            if not os.path.isabs(output_dir):
                output_dir = os.path.join(parent_dir, output_dir.lstrip('./'))
            os.makedirs(output_dir, exist_ok=True)
            
            overlay_opts = _build_overlay_options(self.config)
            
            # Get accounts from config
            accounts = self.config.accounts
            if not accounts:
                self.update_queue.put({
                    'type': 'video_log',
                    'message': '✗ No accounts found in config'
                })
                self.update_queue.put({'type': 'video_done'})
                return
            
            # For now, use first account
            account = accounts[0]
            
            # Get template - check if user selected a specific template
            selected_template = self.template_var.get() if hasattr(self, 'template_var') else "Auto-select"
            
            if selected_template and selected_template != "Auto-select":
                # User selected a specific template - extract template ID from display string
                template_id = selected_template.split(" - ")[0]
                template = self.template_library._index.get(template_id)
                
                if not template:
                    self.update_queue.put({
                        'type': 'video_log',
                        'message': f'✗ Template not found: {template_id}',
                        'level': 'ERROR'
                    })
                    self.update_queue.put({'type': 'video_done'})
                    return
                
                self.update_queue.put({
                    'type': 'video_log',
                    'message': f'Using selected template: {template.id}'
                })
            else:
                # Auto-select template
                template = self.template_library.choose(
                    persona=self.config.template_library.persona,
                    intensity_weights=self.config.template_library.intensity_weights,
                    fandom_preferences=account.preferred_fandoms,
                    preferred_intensity=account.preferred_intensity,
                )
                
                if not template:
                    self.update_queue.put({
                        'type': 'video_log',
                        'message': '✗ No unused templates available',
                        'level': 'WARNING'
                    })
                    self.update_queue.put({'type': 'video_done'})
                    return
                
                self.update_queue.put({
                    'type': 'video_log',
                    'message': f'Using auto-selected template: {template.id}'
                })
            self.update_queue.put({
                'type': 'video_progress',
                'value': 0.2,
                'message': 'Rendering video...'
            })
            
            if post_type == "video":
                source_type = self.video_source_type_var.get() if hasattr(self, 'video_source_type_var') else "base_video"
                output_video = os.path.join(output_dir, f"{account.id}-{template.id}.mp4")
                overlay_text = "\n".join(template.overlay)
                
                if source_type == "base_video":
                    video_path = self.video_path_var.get()
                    # Resolve video path if relative
                    if not os.path.isabs(video_path):
                        video_path = os.path.join(parent_dir, video_path.lstrip('./'))
                    
                    if not os.path.exists(video_path):
                        self.update_queue.put({
                            'type': 'video_log',
                            'message': f'✗ Base video not found: {video_path}'
                        })
                        self.update_queue.put({'type': 'video_done'})
                        return
                    
                    self.update_queue.put({
                        'type': 'video_log',
                        'message': f'Rendering: {os.path.basename(video_path)} -> {os.path.basename(output_video)}',
                        'level': 'INFO'
                    })
                    
                    try:
                        self.update_queue.put({
                            'type': 'video_log',
                            'message': f'Calling ffmpeg to render video...'
                        })
                        
                        _render_video(video_path, output_video, overlay_text, overlay_opts)
                        
                        # Small delay to ensure file is written
                        import time
                        time.sleep(0.5)
                        
                        # Verify file was created
                        if os.path.exists(output_video):
                            file_size = os.path.getsize(output_video)
                            self.update_queue.put({
                                'type': 'video_log',
                                'message': f'✓ Video rendered successfully!'
                            })
                            self.update_queue.put({
                                'type': 'video_log',
                                'message': f'File: {os.path.basename(output_video)} ({file_size / 1024 / 1024:.2f} MB)'
                            })
                            self.update_queue.put({
                                'type': 'video_log',
                                'message': f'Location: {output_video}'
                            })
                        else:
                            self.update_queue.put({
                                'type': 'video_log',
                                'message': f'✗ Video file was not created: {output_video}',
                                'level': 'ERROR'
                            })
                    except Exception as e:
                        self.update_queue.put({
                            'type': 'video_log',
                            'message': f'✗ Error rendering video: {e}',
                            'level': 'ERROR'
                        })
                        import traceback
                        self.update_queue.put({
                            'type': 'video_log',
                            'message': traceback.format_exc(),
                            'level': 'DEBUG'
                        })
                else:  # multiple_images
                    video_image_paths = self.selected_video_image_paths.copy()
                    # Resolve paths if relative
                    resolved_paths = []
                    for img_path in video_image_paths:
                        if not os.path.isabs(img_path):
                            resolved_path = os.path.join(parent_dir, img_path.lstrip('./'))
                        else:
                            resolved_path = img_path
                        resolved_paths.append(resolved_path)
                    
                    # Get image duration and rapid mode
                    try:
                        image_duration = float(self.image_duration_var.get() if hasattr(self, 'image_duration_var') else "3.0")
                    except:
                        image_duration = 3.0
                    
                    rapid_mode = self.rapid_mode_var.get() if hasattr(self, 'rapid_mode_var') else False
                    
                    mode_text = "rapid mode (0.2s per image)" if rapid_mode else f"normal mode ({image_duration}s per image)"
                    self.update_queue.put({
                        'type': 'video_log',
                        'message': f'Creating video from {len(resolved_paths)} images with text overlay ({mode_text})...',
                        'level': 'INFO'
                    })
                    
                    try:
                        create_video_from_images(
                            image_paths=resolved_paths,
                            output_path=output_video,
                            text=overlay_text,
                            opts=overlay_opts,
                            image_duration=image_duration,
                            rapid_mode=rapid_mode,
                        )
                        
                        # Small delay to ensure file is written
                        import time
                        time.sleep(0.5)
                        
                        # Verify file was created
                        if os.path.exists(output_video):
                            file_size = os.path.getsize(output_video)
                            self.update_queue.put({
                                'type': 'video_log',
                                'message': f'✓ Video created successfully from images!'
                            })
                            self.update_queue.put({
                                'type': 'video_log',
                                'message': f'File: {os.path.basename(output_video)} ({file_size / 1024 / 1024:.2f} MB)'
                            })
                            self.update_queue.put({
                                'type': 'video_log',
                                'message': f'Location: {output_video}'
                            })
                        else:
                            self.update_queue.put({
                                'type': 'video_log',
                                'message': f'✗ Video file not found after rendering!',
                                'level': 'ERROR'
                            })
                            self.update_queue.put({
                                'type': 'video_log',
                                'message': f'Expected location: {output_video}',
                                'level': 'DEBUG'
                            })
                    except Exception as e:
                        self.update_queue.put({
                            'type': 'video_log',
                            'message': f'✗ Error creating video from images: {e}',
                            'level': 'ERROR'
                        })
                        import traceback
                        self.update_queue.put({
                            'type': 'video_log',
                            'message': traceback.format_exc(),
                            'level': 'DEBUG'
                        })
            
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            error_str = str(e)
            
            self.update_queue.put({
                'type': 'video_log',
                'message': f'✗ ERROR: {error_str}',
                'level': 'ERROR'
            })
            
            # Show first few lines of error details
            error_lines = error_details.split('\n')
            for line in error_lines[:15]:  # Show first 15 lines
                if line.strip():
                    self.update_queue.put({
                        'type': 'video_log',
                        'message': f'  {line}',
                        'level': 'DEBUG'
                    })
            
            # If it's an ffmpeg error, show the full stderr
            if 'ffmpeg' in error_str.lower() or 'STDERR' in error_str:
                self.update_queue.put({
                    'type': 'video_log',
                    'message': 'Full error details shown above. Check ffmpeg output.',
                    'level': 'WARNING'
                })
                
                # Extract and show ffmpeg stderr if available
                if 'STDERR:' in error_str:
                    stderr_section = error_str.split('STDERR:')[1] if 'STDERR:' in error_str else ''
                    if stderr_section:
                        stderr_lines = stderr_section.split('\n')[:10]
                        self.update_queue.put({
                            'type': 'video_log',
                            'message': 'FFmpeg STDERR:',
                            'level': 'ERROR'
                        })
                        for line in stderr_lines:
                            if line.strip():
                                self.update_queue.put({
                                    'type': 'video_log',
                                    'message': f'  {line.strip()}',
                                    'level': 'ERROR'
                                })
            
            self.update_queue.put({'type': 'video_done'})
            return
        
        # Continue with other post types if video generation succeeded
        if post_type == "slideshow":
            # Get images from selected_image_paths list
            image_paths = self.selected_image_paths.copy()
            
            if not image_paths:
                self.update_queue.put({
                    'type': 'video_log',
                    'message': '✗ No images selected for slideshow',
                    'level': 'ERROR'
                })
                self.update_queue.put({'type': 'video_done'})
                return
            
            if len(image_paths) != len(template.overlay):
                self.update_queue.put({
                    'type': 'video_log',
                    'message': f'✗ Number of images ({len(image_paths)}) must match overlay lines ({len(template.overlay)})'
                })
                self.update_queue.put({'type': 'video_done'})
                return
            
            output_video = os.path.join(output_dir, f"{account.id}-{template.id}-slideshow.mp4")
            
            # Resolve image paths if relative
            resolved_image_paths = []
            for img_path in image_paths:
                if not os.path.isabs(img_path):
                    resolved_path = os.path.join(parent_dir, img_path.lstrip('./'))
                    if os.path.exists(resolved_path):
                        resolved_image_paths.append(resolved_path)
                    else:
                        resolved_image_paths.append(img_path)  # Keep original if not found
                else:
                    resolved_image_paths.append(img_path)
            
            render_slideshow(
                image_paths=resolved_image_paths,
                overlay_texts=template.overlay,
                output_path=output_video,
                opts=overlay_opts,
                slide_duration=3.0,
            )
            
            self.update_queue.put({
                'type': 'video_log',
                'message': f'✓ Slideshow rendered: {output_video}'
            })
        elif post_type == "carousel":
            # Get images from selected_image_paths list
            image_paths = self.selected_image_paths.copy()
            
            if not image_paths:
                self.update_queue.put({
                    'type': 'video_log',
                    'message': '✗ No images selected for carousel',
                    'level': 'ERROR'
                })
                self.update_queue.put({'type': 'video_done'})
                return
            
            # Get selected characters
            selected_chars = []
            if hasattr(self, 'selected_characters'):
                selected_chars = [char for char, var in self.selected_characters.items() if var.get()]
            
            if not selected_chars:
                self.update_queue.put({
                    'type': 'video_log',
                    'message': '✗ No characters selected. Please select at least one character.',
                    'level': 'ERROR'
                })
                self.update_queue.put({'type': 'video_done'})
                return
            
            # Check if template is grid mode
            # Grid mode if explicitly set, OR if overlay is empty (character grid templates have empty overlay)
            grid_mode = (template.carousel_type == 'character_grid' or 
                       template.grid_images == 4 or 
                       (not template.overlay and post_type == "carousel"))
            
            # Resolve image paths if relative
            resolved_image_paths = []
            for img_path in image_paths:
                if not os.path.isabs(img_path):
                    resolved_path = os.path.join(parent_dir, img_path.lstrip('./'))
                    if os.path.exists(resolved_path):
                        resolved_image_paths.append(resolved_path)
                    else:
                        resolved_image_paths.append(img_path)  # Keep original if not found
                else:
                    resolved_image_paths.append(img_path)
            
            # Group images by character based on subcategory metadata
            # Images are matched to characters by comparing subcategory to character name
            character_image_groups = {char: [] for char in selected_chars}
            unmatched_images = []
            
            for img_path in resolved_image_paths:
                # Get metadata for this image
                metadata = self.selected_image_metadata.get(img_path, {})
                subcategory = metadata.get('subcategory', '').lower() if metadata else ''
                
                # Try to match to a selected character
                matched = False
                for char in selected_chars:
                    if subcategory == char.lower():
                        character_image_groups[char].append(img_path)
                        matched = True
                        break
                
                if not matched:
                    unmatched_images.append(img_path)
            
            # Log matching results
            self.update_queue.put({
                'type': 'video_log',
                'message': f'Matching images to {len(selected_chars)} character(s)...'
            })
            for char, images in character_image_groups.items():
                if images:
                    self.update_queue.put({
                        'type': 'video_log',
                        'message': f'  {char}: {len(images)} images'
                    })
            if unmatched_images:
                self.update_queue.put({
                    'type': 'video_log',
                    'message': f'  Warning: {len(unmatched_images)} images could not be matched to any character',
                    'level': 'WARNING'
                })
            
            # Combine all characters into one carousel
            from src.slideshow_renderer import render_carousel
            
            # Collect all images and character names in order
            all_images = []
            all_character_names = []
            
            for character_name in selected_chars:
                char_images = character_image_groups[character_name]
                
                if not char_images:
                    self.update_queue.put({
                        'type': 'video_log',
                        'message': f'  Skipping {character_name}: No matching images found',
                        'level': 'WARNING'
                    })
                    continue
                
                # For carousel grid mode, images must be multiple of 4
                if grid_mode and len(char_images) % 4 != 0:
                    # Round down to nearest multiple of 4
                    rounded_count = (len(char_images) // 4) * 4
                    if rounded_count > 0:
                        char_images = char_images[:rounded_count]
                        self.update_queue.put({
                            'type': 'video_log',
                            'message': f'  {character_name}: Using {rounded_count} images (rounded down to multiple of 4)',
                            'level': 'WARNING'
                        })
                    else:
                        self.update_queue.put({
                            'type': 'video_log',
                            'message': f'  Skipping {character_name}: Not enough images (need at least 4, got {len(char_images)})',
                            'level': 'WARNING'
                        })
                        continue
                
                # Add images and character names for this character
                num_grids = len(char_images) // 4
                for _ in range(num_grids):
                    all_character_names.append(character_name)
                all_images.extend(char_images)
            
            if not all_images:
                self.update_queue.put({
                    'type': 'video_log',
                    'message': '✗ No images available for carousel generation',
                    'level': 'ERROR'
                })
                self.update_queue.put({'type': 'video_done'})
                return
            
            # Generate single carousel ID with all characters
            chars_str = "_".join(selected_chars)
            carousel_id = f"carousel_{account.id}_{template.id}_{chars_str}"
            
            # First slide text: "your month your love and deepspace character" (for LADS)
            # Check if template fandom is love_and_deepspace or lads
            # Split into multiple lines for better visual appearance
            fandom_lower = template.fandom.lower() if template.fandom else ""
            if "love" in fandom_lower and "deepspace" in fandom_lower or "lads" in fandom_lower:
                first_slide_texts = ["your month", "your love and", "deepspace character"]
            else:
                # Fallback for other fandoms - split if it's long
                fallback_text = f"Your {template.fandom or 'character'} character"
                # Split long text into two lines if it's more than 20 characters
                if len(fallback_text) > 20:
                    words = fallback_text.split()
                    mid = len(words) // 2
                    first_slide_texts = [" ".join(words[:mid]), " ".join(words[mid:])]
                else:
                    first_slide_texts = [fallback_text]
            
            self.update_queue.put({
                'type': 'video_log',
                'message': f'Rendering combined carousel with {len(all_images)} images for {len(selected_chars)} character(s)...'
            })
            
            try:
                slide_files = render_carousel(
                    first_slide_texts=first_slide_texts,
                    image_paths=all_images,
                    overlay_texts=template.overlay if not grid_mode else [],
                    output_dir=output_dir,
                    carousel_id=carousel_id,
                    opts=overlay_opts,
                    slide_duration=3.0,
                    audio_path=None,  # Can add music path later
                    character_name=selected_chars[0] if selected_chars else None,  # Keep for backward compatibility
                    grid_mode=grid_mode,
                    character_names=all_character_names,  # Pass character names for each grid
                )
                
                # Final video is the last item
                output_video = os.path.join(output_dir, carousel_id, "final.mp4")
                
                self.update_queue.put({
                    'type': 'video_log',
                    'message': f'✓ Carousel rendered successfully: {output_video}'
                })
                self.update_queue.put({
                    'type': 'video_log',
                    'message': f'  Generated {len(all_character_names)} grid slide(s) for {len(selected_chars)} character(s)'
                })
            except Exception as e:
                self.update_queue.put({
                    'type': 'video_log',
                    'message': f'✗ Error rendering carousel: {e}',
                    'level': 'ERROR'
                })
        
        self.update_queue.put({
            'type': 'video_progress',
            'value': 1.0,
            'message': 'Complete!'
        })
        # Store output path for GeeLark posting
        if output_video:
            self.last_generated_output = output_video
        else:
            self.last_generated_output = None
        self.last_post_type = post_type
        
        self.update_queue.put({
            'type': 'video_log',
            'message': f'✓ Video generated successfully!'
        })
        self.update_queue.put({
            'type': 'video_log',
            'message': f'Output location: {output_dir}'
        })
        if self.last_generated_output:
            self.update_queue.put({
                'type': 'video_log',
                'message': f'Ready to post to GeeLark: {self.last_generated_output}'
            })
        self.update_queue.put({'type': 'video_done'})
    
    def _open_output_folder(self):
        """Open output folder in file explorer."""
        output_dir = self.output_dir_var.get()
        # Resolve relative paths to absolute (relative to project root)
        if not os.path.isabs(output_dir):
            output_dir = os.path.join(parent_dir, output_dir.lstrip('./'))
        
        # Create directory if it doesn't exist
        if not os.path.exists(output_dir):
            try:
                os.makedirs(output_dir, exist_ok=True)
            except Exception as e:
                messagebox.showerror("Error", f"Failed to create output directory: {e}")
                return
        
        if os.path.exists(output_dir):
            import subprocess
            import platform
            try:
                if platform.system() == "Windows":
                    os.startfile(output_dir)
                elif platform.system() == "Darwin":
                    subprocess.Popen(["open", output_dir])
                else:
                    subprocess.Popen(["xdg-open", output_dir])
            except Exception as e:
                messagebox.showerror("Error", f"Failed to open folder: {e}")
        else:
            messagebox.showwarning("Warning", f"Output directory does not exist: {output_dir}")
    
    def video_log(self, message: str, level: str = "INFO"):
        """Add message to video log with timestamp and level."""
        from datetime import datetime
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        # Color coding based on level
        level_prefix = {
            "DEBUG": "[DEBUG]",
            "INFO": "[INFO]",
            "WARNING": "[WARN]",
            "ERROR": "[ERROR]",
            "SUCCESS": "[OK]"
        }.get(level, "[INFO]")
        
        log_message = f"[{timestamp}] {level_prefix} {message}\n"
        self.video_log_text.insert("end", log_message)
        self.video_log_text.see("end")
        self.update()
    
    def geelark_log(self, message: str, level: str = "INFO"):
        """Add message to GeeLark posting log with timestamp and level."""
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        level_prefix = {
            "DEBUG": "[DEBUG]",
            "INFO": "[INFO]",
            "WARNING": "[WARN]",
            "ERROR": "[ERROR]",
            "SUCCESS": "[OK]"
        }.get(level, "[INFO]")
        
        log_message = f"[{timestamp}] {level_prefix} {message}\n"
        self.geelark_log_text.insert("end", log_message)
        self.geelark_log_text.see("end")
        self.update()
    
    def _post_to_geelark(self):
        """Post video/carousel to GeeLark."""
        if not self.config:
            messagebox.showerror("Error", "Please load a config file first")
            return
        
        file_path = self.geelark_file_var.get().strip()
        if not file_path or not os.path.exists(file_path):
            messagebox.showerror("Error", "Please select a valid video file or carousel directory")
            return
        
        account_str = self.geelark_account_var.get()
        if not account_str:
            messagebox.showerror("Error", "Please select an account")
            return
        
        # Extract account ID from dropdown value
        account_id = account_str.split(" - ")[0]
        account = next((acc for acc in self.config.accounts if acc.id == account_id), None)
        if not account:
            messagebox.showerror("Error", f"Account {account_id} not found in config")
            return
        
        caption = self.geelark_caption_text.get("1.0", "end-1c").strip()
        if not caption:
            messagebox.showerror("Error", "Please enter a caption")
            return
        
        try:
            schedule_minutes = int(self.geelark_schedule_var.get())
        except ValueError:
            messagebox.showerror("Error", "Please enter a valid number for schedule minutes")
            return
        
        # Disable button during posting
        self.post_to_geelark_btn.configure(state="disabled", text="Posting...")
        
        # Run posting in background thread
        thread = threading.Thread(
            target=self._post_to_geelark_thread,
            args=(account, caption, schedule_minutes, file_path)
        )
        thread.daemon = True
        thread.start()
    
    def _post_to_geelark_thread(self, account, caption: str, schedule_minutes: int, file_path: str):
        """Post to GeeLark in background thread."""
        try:
            # Initialize GeeLark client
            import os as os_module
            app_id = os_module.getenv("GEELARK_APP_ID")
            client = GeeLarkClient(
                self.config.geelark.api_base,
                self.config.geelark.api_key,
                app_id=app_id
            )
            
            self.update_queue.put({
                'type': 'geelark_log',
                'message': f'Connecting to GeeLark API...'
            })
            
            # Get schedule time
            schedule_at = get_scheduled_time(account.id, schedule_minutes)
            
            # Determine if it's a carousel (directory with slide images) or video file
            is_carousel = os.path.isdir(file_path)
            
            if is_carousel:
                # Upload carousel slides
                carousel_dir = file_path
                slide_files = [f for f in os.listdir(carousel_dir) 
                              if f.startswith("slide_") and (f.endswith(".jpg") or f.endswith(".png") or f.endswith(".jpeg"))]
                slide_files.sort()
                
                if not slide_files:
                    raise Exception("No slide images found in carousel directory")
                
                self.update_queue.put({
                    'type': 'geelark_log',
                    'message': f'Uploading {len(slide_files)} carousel slides...'
                })
                
                slide_urls = []
                for i, slide_file in enumerate(slide_files):
                    slide_path = os.path.join(carousel_dir, slide_file)
                    file_type = client.infer_file_type(slide_path)
                    urls = client.get_upload_url(file_type)
                    client.upload_file_via_put(urls["uploadUrl"], slide_path)
                    slide_urls.append(urls["resourceUrl"])
                    
                    self.update_queue.put({
                        'type': 'geelark_log',
                        'message': f'  Uploaded slide {i+1}/{len(slide_files)}'
                    })
                
                # Create carousel task
                self.update_queue.put({
                    'type': 'geelark_log',
                    'message': f'Creating carousel task in GeeLark...'
                })
                
                task_id = client.add_carousel_task(
                    slide_urls=slide_urls,
                    caption=caption,
                    plan_name="gui-post",
                    music_url=None,  # Can add music later
                    env_id=account.env_id,
                    cloud_phone_id=account.cloud_phone_id,
                    schedule_at=schedule_at,
                    need_share_link=self.config.posting.need_share_link,
                    mark_ai=self.config.posting.mark_ai,
                )
                
                self.update_queue.put({
                    'type': 'geelark_log',
                    'message': f'✓ Carousel task created successfully! Task ID: {task_id}',
                    'level': 'SUCCESS'
                })
            else:
                # Upload video
                self.update_queue.put({
                    'type': 'geelark_log',
                    'message': f'Uploading video to GeeLark...'
                })
                
                file_type = client.infer_file_type(file_path)
                urls = client.get_upload_url(file_type)
                client.upload_file_via_put(urls["uploadUrl"], file_path)
                resource_url = urls["resourceUrl"]
                
                self.update_queue.put({
                    'type': 'geelark_log',
                    'message': f'  Video uploaded: {resource_url}'
                })
                
                # Create task
                self.update_queue.put({
                    'type': 'geelark_log',
                    'message': f'Creating video task in GeeLark...'
                })
                
                task_data = {
                    "scheduleAt": schedule_at,
                    "envId": account.env_id,
                    "video": resource_url,
                    "videoDesc": caption,
                    "needShareLink": self.config.posting.need_share_link,
                    "markAI": self.config.posting.mark_ai,
                }
                task_ids = client.add_tasks(task_type=1, tasks=[task_data], plan_name="gui-post")
                task_id = task_ids[0] if task_ids else None
                
                if task_id:
                    self.update_queue.put({
                        'type': 'geelark_log',
                        'message': f'✓ Video task created successfully! Task ID: {task_id}',
                        'level': 'SUCCESS'
                    })
                else:
                    raise Exception("Failed to create task - no task ID returned")
            
            scheduled_time = datetime.fromtimestamp(schedule_at, tz=timezone.utc)
            self.update_queue.put({
                'type': 'geelark_log',
                'message': f'Scheduled for: {scheduled_time.strftime("%Y-%m-%d %H:%M:%S UTC")}'
            })
            
        except GeeLarkError as e:
            self.update_queue.put({
                'type': 'geelark_log',
                'message': f'✗ GeeLark API error: {e}',
                'level': 'ERROR'
            })
        except Exception as e:
            self.update_queue.put({
                'type': 'geelark_log',
                'message': f'✗ Error posting to GeeLark: {e}',
                'level': 'ERROR'
            })
        finally:
            # Re-enable button
            self.after(0, lambda: self.post_to_geelark_btn.configure(state="normal", text="Post to GeeLark"))


def main():
    """Main entry point for the GUI."""
    app = UnifiedDashboardGUI()
    app.mainloop()


if __name__ == "__main__":
    main()
