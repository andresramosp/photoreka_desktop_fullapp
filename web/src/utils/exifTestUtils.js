// Test script for EXIF extraction functionality
// This file demonstrates how the EXIF extraction works

import {
  extractBasicExifData,
  getCompactExifSummary,
  formatExifDate,
} from "../utils/exifUtils.js";

/**
 * Test function to verify EXIF extraction works
 * You can call this from a Vue component to test with real files
 */
export async function testExifExtraction(file) {
  console.log("🧪 Testing EXIF extraction for:", file.name);

  try {
    // Extract basic EXIF data
    const rawExifData = await extractBasicExifData(file);
    console.log("📊 Raw EXIF data:", rawExifData);

    // Get compact summary
    const compactSummary = getCompactExifSummary(rawExifData);
    console.log("📋 Compact summary:", compactSummary);

    // Test date formatting
    if (rawExifData?.dateTaken) {
      const formattedDate = formatExifDate(rawExifData.dateTaken);
      console.log("📅 Formatted date:", formattedDate);
    }

    return {
      success: true,
      rawData: rawExifData,
      compactSummary: compactSummary,
    };
  } catch (error) {
    console.error("❌ EXIF extraction test failed:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Example of what the payload will look like when sending to the server
 */
export function getExamplePayload() {
  return {
    fileType: "image/jpeg",
    originalName: "IMG_1234.jpg",
    source: "local",
    exifData: {
      dateTaken: "2024-03-15T14:30:25.000Z",
      camera: "Canon EOS R5",
      focalLength: 85,
      aperture: 1.8,
      exposureTime: 0.005, // 1/200s
      iso: 400,
      flash: 0, // No flash
      whiteBalance: "Auto",
      hasGps: true,
      gps: {
        lat: 40.7589,
        lng: -73.9851,
      },
    },
  };
}
