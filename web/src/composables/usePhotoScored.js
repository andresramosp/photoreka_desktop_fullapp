/**
 * Composable for photo scoring and relevance utilities
 */
export function usePhotoScored() {
  /**
   * Computes the star rating for a photo based on matchScore or labelScore
   * @param {PhotoWithMatchData} photo - Photo object with matchScore or labelScore
   * @returns {number} Star rating (0-3)
   */
  function computePhotoStars(photo) {
    // If matchScore exists and is greater than 0, use it directly
    if (photo.matchScore && photo.matchScore > 0) {
      return Math.max(1, Math.min(3, photo.matchScore));
    }

    // If labelScore exists, convert it to stars using the enum mapping
    if (photo.labelScore) {
      switch (photo.labelScore) {
        case "excellent":
          return 3;
        case "good":
          return 2;
        case "fair":
          return 1;
        case "poor":
          return 0;
        default:
          return 0;
      }
    }

    return 0;
  }

  /**
   * Determines if the low relevance icon should be shown
   * @param {PhotoWithMatchData} photo - Photo object with matchScore or labelScore
   * @returns {boolean} Whether to show low relevance icon
   */
  function shouldShowLowRelevanceIcon(photo) {
    // If there's a matchScore, don't show low relevance icon
    if (photo.matchScore && photo.matchScore > 0) {
      return false;
    }

    // Show low relevance icon if labelScore is 'poor'
    if (photo.labelScore) {
      return photo.labelScore === "poor";
    }

    return false;
  }

  /**
   * Gets the normalized score (0-3) from either matchScore or labelScore
   * @param {PhotoWithMatchData} photo - Photo object with matchScore or labelScore
   * @returns {number} Normalized score (0-3)
   */
  function getNormalizedScore(photo) {
    // If matchScore exists and is greater than 0, use it directly
    if (photo.matchScore && photo.matchScore > 0) {
      return Math.max(0, Math.min(3, photo.matchScore));
    }

    // If labelScore exists, convert it to number
    if (photo.labelScore) {
      switch (photo.labelScore) {
        case "excellent":
          return 3;
        case "good":
          return 2;
        case "fair":
          return 1;
        case "poor":
          return 0;
        default:
          return 0;
      }
    }

    return 0;
  }

  return {
    computePhotoStars,
    shouldShowLowRelevanceIcon,
    getNormalizedScore,
  };
}
