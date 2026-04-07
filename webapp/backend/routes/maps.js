const express = require("express");
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");

const router = express.Router();

// Initialize reverse geocoding client safely (do not crash server if key is missing).
function getGeocodingClient() {
  const accessToken = process.env.MAPBOX_API_KEY || process.env.VITE_MAPBOX_API_KEY;
  if (!accessToken) {
    return null;
  }
  return mbxGeocoding({ accessToken });
}

// GET /reverseGeocode?lng=-122.42&lat=37.78&lang="en"
router.get("/reverseGeocode", async (req, res) => {
  try {
    const geocodingClient = getGeocodingClient();
    if (!geocodingClient) {
      return res.status(503).json({
        error: "Mapbox API key is not configured on backend"
      });
    }

    const { lng, lat, lang } = req.query;
    const lngNum = Number(lng);
    const latNum = Number(lat);
    const language = typeof lang === "string" && lang.trim() ? lang.trim() : "en";

    // Validate inputs
    if (!Number.isFinite(lngNum) || !Number.isFinite(latNum)) {
      return res.status(400).json({
        error: "Invalid lng or lat query parameters"
      });
    }

    const response = await geocodingClient
      .reverseGeocode({
        query: [lngNum, latNum],
        language: [language],
        limit: 1,
        type: ["place", "locality", "neighborhood", "street", "address"] 
      })
      .send();

    const features = response.body.features;

    if (features && features.length > 0) {
      const place = features[0];

      return res.json({
        place_name: place.place_name,
        coordinates: place.center,
        type: place.place_type
      });
    } else {
      return res.status(404).json({
        error: "No location found"
      });
    }

  } catch (err) {
    const statusCode = Number(err?.statusCode) || Number(err?.status) || 500;
    const safeStatus = statusCode >= 400 && statusCode < 600 ? statusCode : 500;
    console.error("reverseGeocode error:", err?.message || err);

    return res.status(safeStatus).json({
      error: err?.message || "Server error"
    });
  }
});

module.exports = router;