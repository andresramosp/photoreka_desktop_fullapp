# 3D Atlas Components

This directory contains specialized components for the 3D photo viewer (Photos3D.vue).

## Components

### FixedActionBar.vue

A compact action bar component designed for the 3D viewer's selected photos panel. Displays action buttons horizontally next to the photo selection counter.

**Features:**

- Download selected photos (single or as ZIP)
- Add to collection (if enabled)
- Move to tool (if enabled)
- Compact design optimized for limited space
- Reuses the same action buttons and icons as FloatingActionBar

**Props:**

- `selectedCount`: Number of selected photos (required)
- `showAddToCollection`: Show add to collection button (default: true)
- `showMoveToTool`: Show move to tool button (default: true)
- `isDownloading`: Loading state for download action (default: false)

**Events:**

- `download`: Triggered when download button is clicked
- `add-to-collection`: Triggered when add to collection button is clicked
- `move-to-tool`: Triggered when move to tool button is clicked

**Usage:**

```vue
<FixedActionBar
  :selectedCount="selectedPhotos.length"
  :showAddToCollection="!isPlayground"
  :showMoveToTool="!isPlayground"
  :isDownloading="isDownloading"
  @download="handleDownloadPhotos"
  @add-to-collection="handleAddToCollection"
  @move-to-tool="handleMoveToTool"
/>
```

**Implementation Details:**

- Downloads single photos directly without ZIP compression
- Downloads multiple photos as a ZIP archive
- Integrates with `usePhotoDownload` composable for download functionality
- Opens `CollectionModal` for adding photos to collections
- Opens `PhotoToolSelector` for moving photos to tools
- Clears selection after successful operations
