# 2D Photo Scatter Visualization

A 2D visualization tool for exploring photo collections using a scatter plot interface.

## Overview

The 2D Photo Scatter is similar to the 3D Atlas but displays photos on a 2D surface with pan and zoom capabilities. It uses dimensionality reduction (outputDims=2) to project photo embeddings onto a 2D plane where similar photos are positioned close together.

## Components

### Photos2D.vue

The main component that renders the 2D canvas using vue-konva. Features include:

- **Pan**: Click and drag to move around the canvas
- **Zoom**: Mouse wheel or pinch gesture to zoom in/out
- **Photo selection**: Click on photos to select/deselect them
- **Hover tooltips**: Preview photos on hover

### Photos2DConfigPanel.vue

Configuration panel with filters:

- **Clustering Type**: Select different embedding types (General, Narrative, Cultural context, etc.)
- **Search Filters**: Filter by visual aspects, artistic scores, and time range
- **Display Options**: Adjust photo size and reset view
- **Navigation Controls**: Help text for navigation

### use2DPhotos.js (Composable)

Handles data fetching and state management:

- Fetches photos from API with `outputDims=2`
- Manages loading state and errors
- Provides bounds calculation for viewport fitting
- Supports low-performance mode (limits to 750 photos)

## Routes

- `/scatter` - Authenticated user's 2D scatter view
- `/2d-catalog/:userId` - Public shared catalog view
- `/shared-scatter/:userId` - Alias for shared catalog

## Usage

Navigate to `/scatter` to view your photo collection in 2D. Use the filters in the config panel to explore different clustering types and filter photos.

## Future Improvements

- Grid layout mode (convert scatter to organized grid)
- Lasso selection for multiple photos
- Minimap for navigation
- Photo grouping/clustering visualization
- Export selected photos
