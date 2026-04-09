// webapp/Backend/routes/maps.js

const express = require("express");
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");

const router = express.Router();

// Initialize reverse geocoding client once
const geocodingClient = mbxGeocoding({
  accessToken: process.env.MAPBOX_API_KEY
});

// GET /reverseGeocode?lng=-122.42&lat=37.78&lang="en"
router.get("/reverseGeocode", async (req, res) => {
  try {
    const { lng, lat, lang } = req.query;

    // Validate inputs
    if (!lng || !lat || !lang) {
      return res.status(400).json({
        error: "Missing lng or lat query parameters"
      });
    }

    const response = await geocodingClient
      .reverseGeocode({
        query: [parseFloat(lng), parseFloat(lat)],
        language: lang,
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
    console.error(err.message);

    return res.status(500).json({
      error: "Server error"
    });
  }
});

module.exports = router;