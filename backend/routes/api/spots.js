const express = require("express");
const router = express.Router();
const { Spot, Review, ReviewImage, SpotImage, User, Booking } = require("../../db/models");
const { Sequelize, Op } = require("sequelize");
const { check, validationResult } = require("express-validator");
const { handleValidationErrors } = require("../../utils/validation");

const { setTokenCookie, requireAuth } = require("../../utils/auth.js");
const { restoreUser } = require("../../utils/auth");






const ValidateSpotEdit = [
  check("address").exists({ checkFalsy: true }).withMessage("Street address is required"),
  check("city").exists({ checkFalsy: true }).withMessage("City is required"),
  check("state").exists({ checkFalsy: true }).withMessage("State is required"),
  check("country").exists({ checkFalsy: true }).withMessage("Country is required"),
  check("lat").exists({ checkFalsy: true }).isNumeric().withMessage("Latitude is not valid"),
  check("lng").exists({ checkFalsy: true }).isNumeric().withMessage("Longitude is not valid"),
  check("name").exists({ checkFalsy: true }).isLength({ max: 50 }).withMessage("Name must be less than 50 characters"),
  check("description").exists({ checkFalsy: true }).withMessage("Description is required"),
  check("price").exists({ checkFalsy: true }).isNumeric().withMessage("Price per day is required"),
  handleValidationErrors,
];

const validateQueryParams = [
  check("page").optional().isInt({ min: 1 }).withMessage("Page must be an integer greater than 0"),
  check("size").optional().isInt({ min: 1 }).withMessage("Size must be an integer greater than 0"),
  check("minLat").optional().isFloat({ min: -90, max: 90 }).withMessage("Minimum latitude must be between -90 to 90"),
  check("maxLat")
    .optional()
    .isFloat({ max: 90 })
    .custom((val, { req }) => parseFloat(req.query.minLat ?? -90) < parseFloat(req.query.maxLat))
    .withMessage("Maximum latitude must be between -90 to 90 and greater than minimum latitude"),
  check("minLng").optional().isFloat({ min: -180, max: 180 }).withMessage("Minimum longitude must be between -180 to 180"),
  check("maxLng")
    .optional()
    .isFloat({ max: 180 })
    .withMessage("Maximum longitude must be less than 180")
    .custom((val, { req }) => parseFloat(req.query.minLng ?? -180) < parseFloat(req.query.maxLng))
    .withMessage("Maximum longitude must be greater than minimum longitude"),
  check("minPrice").optional().isFloat({ min: 0 }).withMessage("Minimum price must be greater than or equal to 0"),
  check("maxPrice")
    .optional()
    .isFloat()
    .custom((val, { req }) => (req.query.minPrice ?? 0) < req.query.maxPrice)
    .withMessage("Maximum price must be greater than 0 and greater than minimum price"),
  handleValidationErrors,
];

/**** GET all spots ****/
router.get("/", validateQueryParams, async (req, res, next) => {
  let { page, size, minLat, maxLat, minLng, maxLng, minPrice, maxPrice } = req.query;
  page = page ? page : 1;
  size = size ? size : 20;

  const where = {};

  /*** search filters ***/
  if (minLat != undefined || maxLat != undefined) {
    const filter = [];

    // obligatory "sequelize sucks"
    if (minLat != undefined) {
      filter.push({ [Op.gte]: parseFloat(minLat) });
    }

    if (maxLat != undefined) {
      filter.push({ [Op.lte]: parseFloat(maxLat) });
    }

    where.lat = { [Op.and]: filter };
  }

  if (minLng != undefined || maxLng != undefined) {
    const filter = [];

    if (minLng != undefined) {
      filter.push({ [Op.gte]: parseFloat(minLng) });
    }

    if (maxLng != undefined) {
      filter.push({ [Op.lte]: parseFloat(maxLng) });
    }

    where.lng = { [Op.and]: filter };
  }

  if (minPrice != undefined || maxPrice != undefined) {
    const filter = [];

    if (minPrice != undefined) {
      filter.push({ [Op.gte]: parseFloat(minPrice) });
    }

    if (maxPrice != undefined) {
      filter.push({ [Op.lte]: parseFloat(maxPrice) });
    }

    where.price = { [Op.and]: filter };
  }
  /*** end search filters ***/

  try {
    const allSpots = await Spot.findAll({
      offset: (page - 1) * size,
      limit: size,
      where,
      attributes: [
        "id",
        "ownerId",
        "address",
        "city",
        "state",
        "country",
        "lat",
        "lng",
        "name",
        "description",
        "price",
        "createdAt",
        "updatedAt",
        [Sequelize.fn("AVG", Sequelize.col("Reviews.stars")), "avgRating"], // Calculate average rating
      ],
      include: [
        {
          model: SpotImage, // Include associated images
          attributes: ["url"], // Get image URL
          where: { preview: true },
          required: false,
          duplicating: false,
        },
        {
          model: Review,
          attributes: [],
          required: false,
          duplicating: false,
        },
      ],
      group: ["Spot.id", "SpotImages.id"],
    });

    const allSpotsArray = allSpots.map((spot) => {
      return {
        id: spot.id,
        ownerId: spot.ownerId,
        address: spot.address,
        city: spot.city,
        state: spot.state,
        country: spot.country,
        lat: parseFloat(spot.lat), // sometimes these two are strings. i don't know why,
        lng: parseFloat(spot.lng), // but we'll parse them as floats to fix it.
        name: spot.name,
        description: spot.description,
        price: parseFloat(spot.price), // probably worth doing it here too.
        createdAt: spot.createdAt,
        updatedAt: spot.updatedAt,
        avgRating: spot.get("avgRating") ? parseFloat(spot.get("avgRating")).toFixed(1) : null,
        previewImage: spot.SpotImages.length ? spot.SpotImages[0].url : null,
      };
    });

    return res.status(200).json({Spots: allSpotsArray });
  } catch (error) {
    next(error);
  }
});

/**** Validate Create Spot POST body ****/
const validateSpotData = [
  check("address").exists({ checkFalsy: true }).withMessage("Street address is required"),
  check("city").exists({ checkFalsy: true }).withMessage("City is required"),
  check("state").exists({ checkFalsy: true }).withMessage("State is required"),
  check("country").exists({ checkFalsy: true }).withMessage("Country is required"),
  check("lat").exists({ checkFalsy: true }).isFloat({ min: -90, max: 90 }).withMessage("Latitude is not valid"),
  check("lng").exists({ checkFalsy: true }).isFloat({ min: -180, max: 180 }).withMessage("Longitude is no valid"),
  check("name").exists({ checkFalsy: true }).isLength({ max: 50 }).withMessage("Name must be less than 50 characters"),
  check("description").exists({ checkFalsy: true }).withMessage("Description is required"),
  check("price").exists({ checkFalsy: true }).isFloat({ gt: 0 }).withMessage("Price per day must be a positive number"),
  handleValidationErrors,
];

/**** CREATE spot ****/
router.post("/", restoreUser, requireAuth, validateSpotData, async (req, res) => {
  try {
    const { address, city, state, country, lat, lng, name, description, price } = req.body; // missing id, ownerId
    const { user } = req;
    // const userId = user.id;
    if (!user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const newSpot = await Spot.create({
      ownerId: user.id,
      address,
      city,
      state,
      country,
      lat,
      lng,
      name,
      description,
      price,
    });

    return res.status(201).json(newSpot);
  } catch (error) {
    // Handle Sequelize validation errors
    // if (error.name === 'SequelizeValidationError') {
    //   return res.status(400).json({
    //     message: "Bad Request",
    //     errors: error.errors.reduce((acc, curr) => {
    //       acc[curr.path] = curr.message;
    //       return acc;
    //     }, {})
    //   });
    // }
    // Pass any other error to the next middleware
    next(error);
  }
});

/**** GET current user's spots ****/
router.get("/current", restoreUser, requireAuth, async (req, res, next) => {
  try {
    const { user } = req;

    // Restore user ensures user is loggedin
    if (user) {
      const userId = user.id;

      // Capture user's spot listings + associated preview images
      const userSpots = await Spot.findAll({
        where: { ownerId: userId },
        include: [
          // Fetch images
          {
            model: SpotImage,
            where: { preview: true }, // Include only where there are pics
            required: false, // without voiding query if no pics
            attributes: ["url"],
          },
          {
            model: Review, // Fetch reviews for forthcoming aggregation
            attributes: [],
          },
        ],
        attributes: [
          // DELETE. not listing any would pull all atts? listing some will pull that exclusive list of atts?
          "id",
          "ownerId",
          "address",
          "city",
          "state",
          "country",
          "lat",
          "lng",
          "name",
          "description",
          "price",
          "createdAt",
          "updatedAt",
          [Sequelize.fn("AVG", Sequelize.col("Reviews.stars")), "avgRating"],
        ],
        group: ["Spot.id", "SpotImages.id"],
      });

      // Capture spots in array indexes
      const userSpotsArray = userSpots.map((userSpots) => ({
        id: userSpots.id,
        ownerId: userSpots.ownerId,
        address: userSpots.address,
        city: userSpots.city,
        state: userSpots.state,
        country: userSpots.country,
        lat: userSpots.lat,
        lng: userSpots.lng,
        name: userSpots.name,
        description: userSpots.description,
        price: userSpots.price,
        createdAt: userSpots.createdAt,
        updatedAt: userSpots.updatedAt,
        avgRating: userSpots.get("avgRating") !== null ? parseFloat(userSpots.get("avgRating")).toFixed(1) : null,
        previewImage: userSpots.SpotImages.length ? userSpots.SpotImages[0].url : null,
      }));

      // Encapsulate spots in object
      return res.status(200).json({ Spots: userSpotsArray });
    } else {
      return res.status(401).json({ message: "Authentication required" });
    }
  } catch (error) {
    // Pass query or response error for handdling
    next(error);
  }
});

/**** GET spot details on id ****/
// router.get("/:spotId", async (req, res, next) => {
//   // get spot id to parse
//   const { spotId } = req.params;

//   try {
//     // Capture spot deatils including associated images and owner details
//     const spot = await Spot.findOne({
//       where: { id: spotId },
//       include: [
//         {
//           model: SpotImage,
//           attributes: ["id", "url", "preview"],
//         },
//         {
//           model: User,
//           as: "Owner",
//           attributes: ["id", "firstName", "lastName"],
//         },
//       ],
//     });

//     // Return 404 if spot not found
//     if (!spot) {
//       return res.status(404).json({
//         message: "Spot couldn't be found",
//       });
//     }

//     // Create aggregate columns on query
//     const aggregateStats = await Review.findOne({
//       where: { spotId: spot.id },
//       attributes: [
//         [Sequelize.fn("COUNT", Sequelize.col("Review.id")), "numReviews"],
//         [Sequelize.fn("AVG", Sequelize.col("stars")), "avgStarRating"],
//       ],
//     });

//     // Spot details derived from Spots, and spot associations
//     // with SpotImages, Reviews, and Users.
//     const detailedResponse = {
//       id: spot.id,
//       ownerId: spot.ownerId,
//       address: spot.address,
//       city: spot.city,
//       state: spot.state,
//       country: spot.country,
//       lat: spot.lat,
//       lng: spot.lng,
//       name: spot.name,
//       description: spot.description,
//       price: spot.price,
//       createdAt: spot.createdAt,
//       updatedAt: spot.updatedAt,
//       numReviews: parseInt(aggregateStats.numReviews) || 0, // aggregate
//       avgStarRating: parseInt(aggregateStats.avgStarRating).toFixed(1) || 0, // aggregate
//       SpotImages: spot.SpotImages, // array
//       Owner: {
//         // alias assocation
//         id: spot.Owner.id,
//         firstName: spot.Owner.firstName,
//         lastName: spot.Owner.lastName,
//       },
//     };

//     return res.status(200).json(detailedResponse);
//   } catch (error) {
//     return next(error);
//   }
// });



router.get("/:spotId", async (req, res, next) => {
  const { spotId } = req.params;

  try {
    // Capture spot details including associated images and owner details
    const spot = await Spot.findOne({
      where: { id: spotId },
      include: [
        {
          model: SpotImage,
          attributes: ["id", "url", "preview"],
        },
        {
          model: User,
          as: "Owner",
          attributes: ["id", "firstName", "lastName"],
        },
      ],
    });

    // Return 404 if spot not found
    if (!spot) {
      return res.status(404).json({
        message: "Spot couldn't be found",
      });
    }

    // Create aggregate columns on query
    const aggregateStats = await Review.findOne({
      where: { spotId: spot.id },
      attributes: [
        [Sequelize.fn("COUNT", Sequelize.col("Review.id")), "numReviews"],
        [Sequelize.fn("AVG", Sequelize.col("stars")), "avgStarRating"],
      ],
      raw: true, // Add raw: true to get plain object
    });

    // Ensure aggregate values are not null
    const numReviews = aggregateStats.numReviews ? parseInt(aggregateStats.numReviews) : 0;
    //const avgStarRating = aggregateStats.avgStarRating ? parseFloat(aggregateStats.avgStarRating).toFixed(1) : "0.0";
const avgStarRating = aggregateStats.avgStarRating !== null ? parseFloat(aggregateStats.avgStarRating).toFixed(1) : "0.0";
    // Spot details derived from Spots, and spot associations
    // with SpotImages, Reviews, and Users.
    const detailedResponse = {
      id: spot.id,
      ownerId: spot.ownerId,
      address: spot.address,
      city: spot.city,
      state: spot.state,
      country: spot.country,
      lat: spot.lat,
      lng: spot.lng,
      name: spot.name,
      description: spot.description,
      price: spot.price,
      createdAt: spot.createdAt,
      updatedAt: spot.updatedAt,
      numReviews,
      avgStarRating,
      SpotImages: spot.SpotImages, // array
      Owner: {
        // alias association
        id: spot.Owner.id,
        firstName: spot.Owner.firstName,
        lastName: spot.Owner.lastName,
      },
    };

    return res.status(200).json(detailedResponse);
  } catch (error) {
    return next(error);
  }
});





/**** EDIT a spot on id ****/
router.put("/:spotId", restoreUser, requireAuth, ValidateSpotEdit, async (req, res, next) => {
  const { user } = req;
  const userId = user.id;

  if (!user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const spot = await Spot.findByPk(req.params.spotId);

  if (!spot) {
    return res.status(404).json({ message: "Spot couldn't be found" });
  }

  if (userId !== spot.ownerId) {
    return res.status(403).json({ message: "Spot must belong to the current user" });
  }

  const { address, city, state, country, lat, lng, name, description, price } = req.body;

  // update or reassign initial values on update if falsy
  spot.address = address || spot.address;
  spot.city = city || spot.city;
  spot.state = state || spot.state;
  spot.country = country || spot.country;
  spot.lat = lat !== undefined ? lat : spot.lat; // left of ternary checks for undefined, if so, leaves value unchanged
  spot.lng = lng !== undefined ? lng : spot.lng; // right of ternary assigns new value if truthy, otherwise reassigns old value
  spot.name = name || spot.name;
  spot.description = description || spot.description;
  spot.price = price !== undefined ? price : spot.price;

  try {
    await spot.save();
  } catch (error) {
    return next(error);
  }

  return res.status(200).json(spot);
});

/**** DELETE a review by its ID ****/
router.delete("/:spotId", restoreUser, requireAuth, async (req, res, next) => {
  const { user } = req;

  if (!user) {
    return res.status(401).json({ message: "You must be signed in to access this resource." });
  }

  const userId = user.id;
  const dropSpot = await Spot.findByPk(req.params.spotId);

  if (!dropSpot) {
    return res.status(404).json({ message: "Spot couldn't be found" });
  }

  if (userId !== dropSpot.ownerId) {
    return res.status(403).json({ message: "Spot must belong to the current user" });
  }

  try {
    await dropSpot.destroy();
    return res.status(200).json({ message: "Successfully deleted" });
  } catch (error) {
    return next(error);
  }
});

/**** Validate new booking request ****/
const validateBooking = [
  // Check if startDate exists
  check("startDate")
    .exists({ checkFalsy: true })
    .withMessage("Start date is required")
    .isISO8601()
    .withMessage("Start date must be a valid date")
    .custom((value) => {
      const startDate = new Date(value);
      if (startDate < new Date()) {
        throw new Error("Start date cannot be in the past");
      }
      return true;
    }),

  // Check if endDate exists and is after startDate
  check("endDate")
    .exists({ checkFalsy: true })
    .withMessage("End date is required")
    .isISO8601()
    .withMessage("End date must be a valid date")
    .custom((value, { req }) => {
      const startDate = new Date(req.body.startDate);
      const endDate = new Date(value);
      if (endDate <= startDate) {
        throw new Error("End date must be after the start date");
      }
      return true;
    }),
  handleValidationErrors,
];

/**** CREATE booking on spot id  ****/
router.post("/:spotId/bookings", restoreUser, requireAuth, validateBooking, async (req, res, next) => {
  const { user } = req; // Retrieve full record of current user
  const { spotId } = req.params; // Retrieve unique identifier of spot user wants to book

  // Retrieve requested booking dates and convert to timestamps
  const startTimestamp = new Date(req.body.startDate)
  const endTimestamp = new Date(req.body.endDate)






  // Retrieve full record of spot user wants to book
  const spot = await Spot.findByPk(spotId);

  // User can't book if not logged in
  if (!user) {
    return res.status(401).json({
      message: "Authentication required",
    });
  }

  // User can't create booking for spot that does not exists
  if (!spot) {
    return res.status(404).json({
      message: "Spot couldn't be found",
    });
  }

  // Spot owner can't book their own spot
  if (user.id === spot.ownerId) {
    return res.status(403).json({
      message: "Forbidden",
    });
  }

  // Find conflicting bookings
  const bookingConflicts = await Booking.findAll({
    where: {
      // search for bookings where the requested start
      spotId: spotId, // or end date falls withing an existing booking's dates.
      [Op.or]: {
        startDate: { [Op.between]: [startTimestamp, endTimestamp] },
        endDate: { [Op.between]: [startTimestamp, endTimestamp] },
      },
    },
  });

  // If there are errors, return populate object full of relevant errors
  if (bookingConflicts.length) {
    const errors = {};

    // Iterate over each booking conflict
    for (const conflict of bookingConflicts) {
      // Convert conflicting date into time stamps for comparasion
      const conflictStartTimestamp = new Date(conflict.startDate).getTime();
      const conflictEndTimestamp = new Date(conflict.endDate).getTime();

      // Check if requested start date overlaps with conflicting booking
      if (conflictStartTimestamp < startTimestamp && startTimestamp < conflictEndTimestamp) {
        errors.startDate = "Start date conflicts with an existing booking";
      }

      // Check if requested end date overlaps with conflicting booking
      if (conflictStartTimestamp < endTimestamp && endTimestamp < conflictEndTimestamp) {
        errors.endDate = "End date conflicts with an existing booking";
      }
    }

    // User's requested dates can't overlap existing bookings
    return res.status(403).json({
      message: "Sorry, this spot is already booked for the specified dates",
      errors,
    });
  }

  try {
    // Create new booking for the spot
    const newBooking = await spot.createBooking({
      spotId: spotId,
      userId: user.id,
      startDate: new Date(startTimestamp),
      endDate: new Date(endTimestamp),
    });

    // Return newly created booking
    return res.status(201).json(newBooking);
  } catch (error) {
    return next(error);
  }
});

/**** validate spot image ****/
// const validateSpotImage = [
//   check("url").exists({ checkFalsy: true }).withMessage("Image url is required"),
//   check("preview").exists({ checkFalsy: true }).withMessage("Preview is required").bail().toBoolean().isBoolean().withMessage("Preview must be a boolean value"),
//   handleValidationErrors,
// ];



// const validateSpotImage = [
//   check("url").exists({ checkFalsy: true }).withMessage("Image url is required"),
//   check("preview").exists({ checkFalsy: true }).withMessage("Preview is required").bail().toBoolean().isBoolean().withMessage("Preview must be a boolean value"),
//   (req, res, next) => {
//     console.log("Request body in validation middleware:", req.body); // Log the request body
//     handleValidationErrors(req, res, next);
//   },
// ];


/**** ADD image to spot on id ****/



// const validateSpotImage = [
//   check("url").exists({ checkFalsy: true }).withMessage("Image url is required"),
//   (req, res, next) => {
//     console.log("Request body in validation middleware:", req.body); // Log the request body
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       console.log("Validation errors:", errors.array()); // Log validation errors
//       return res.status(400).json({ errors: errors.array() });
//     }
//     next();
//   },
// ];


const validateSpotImage = [
  check("images").isArray({ min: 1 }).withMessage("At least one image is required"),
  check("images.*.url").isURL().withMessage("Each image URL must be valid"),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
];

// router.post("/:spotId/images", validateSpotImage, async (req, res) => {
//   console.log("Request body in route handler:", req.body); // Log the request body
//   try {
//     const { url, preview } = req.body;
//     const spotId = req.params.spotId;

//     // Assuming you have a SpotImage model
//     const newImage = await SpotImage.create({
//       spotId,
//       url,
//       preview: preview || false, // Default to false if preview is not provided
//     });

//     res.status(201).json(newImage);
//   } catch (err) {
//     console.error("Error in route handler:", err);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });


// Route to add images to a specific spot
router.post("/:spotId/images", validateSpotImage, async (req, res) => {
  try {
    const { url, preview } = req.body;
    const spotId = req.params.spotId;

    // Assuming you have a SpotImage model
    const newImage = await SpotImage.create({
      spotId,
      url,
      preview: preview || false, // Default to false if preview is not provided
    });

    res.status(201).json(newImage);
  } catch (err) {
    console.error("Error in route handler:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route to update images for a specific spot
// router.put("/:spotId/images", validateSpotImage, async (req, res) => {
//   console.log("Request body in update route handler:", req.body); // Log the request body
//   try {
//     const spotId = req.params.spotId;
//     const images = req.body;

//     // Assuming you have a SpotImage model
//     await SpotImage.destroy({ where: { spotId } }); // Delete existing images

//     const updatedImages = await Promise.all(
//       images.map(async (image) => {
//         const newImage = await SpotImage.create({
//           spotId,
//           url: image.url,
//           preview: image.preview || false,
//         });
//         return newImage;
//       })
//     );

//     res.status(200).json(updatedImages);
//   } catch (err) {
//     console.error("Error in update route handler:", err);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });


const sequelize = require("sequelize");

router.put("/:spotId/images", validateSpotImage, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const spotId = req.params.spotId;
    const images = req.body;

    // Validate images array
    if (!Array.isArray(images) || images.some((img) => !img.url)) {
      return res.status(400).json({ error: "Invalid image data" });
    }

    // Delete existing images
    await SpotImage.destroy({ where: { spotId }, transaction });

    // Bulk create new images
    const updatedImages = await SpotImage.bulkCreate(
      images.map((image) => ({
        spotId,
        url: image.url,
        preview: image.preview || false,
      })),
      { transaction }
    );

    // Commit transaction
    await transaction.commit();
    res.status(200).json(updatedImages);
  } catch (err) {
    // Rollback transaction on error
    if (transaction) await transaction.rollback();
    console.error("Error in update route handler:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});








/**** validate review ****/
const validateReview = [
  // do we need to validate id type fields: id, userId, spotId?
  check("review")
    .exists({ checkFalsy: true })
    .withMessage("Review text is required")
    .isString()
    .withMessage("Review must be a string")
    .isLength({ max: 4000 })
    .withMessage("Review must not exceed the length of a verified user's tweet"),
  check("stars").exists({ checkFalsy: true }).withMessage("Stars rating is required").isInt({ min: 1, max: 5 }).withMessage("Stars must be an integer between 1 and 5"),
  handleValidationErrors,
];

/**** CREATE review on spot id  ****/
// router.post("/:spotId/reviews", restoreUser, requireAuth, validateReview, async (req, res, next) => {
//   const { spotId } = req.params; // retireve spotId to add review at
//   const { review, stars } = req.body; // retrieve info to populate review
//   const { user } = req; // current user adding image
//   const userId = user.id;

//   const spot = await Spot.findByPk(spotId);

//   if (!spot) {
//     return res.status(404).json({
//       message: "Spot couldn't be found",
//     });
//   }

//   const spotReviews = await Review.findAll({
//     where: {
//       [Op.and]: [{ spotId: spotId }, { userId: userId }],
//     },
//   });

//   if (spotReviews.length) {
//     return res.status(500).json({
//       message: "User already has a review for this spot",
//     });
//   }

//   try {
//     const newReview = await spot.createReview({
//       userId,
//       spotId,
//       review,
//       stars,
//     });

//     return res.status(201).json(newReview);
//   } catch (e) {
//     return next(e);
//   }
// });


router.post("/:spotId/reviews", restoreUser, requireAuth, validateReview, async (req, res, next) => {
  const { spotId } = req.params; // retrieve spotId to add review at
  const { review, stars } = req.body; // retrieve info to populate review
  const { user } = req; // current user adding review
  const userId = user.id;

  const spot = await Spot.findByPk(spotId);

  if (!spot) {
    return res.status(404).json({
      message: "Spot couldn't be found",
    });
  }

  const newReview = await Review.create({
    review,
    stars,
    spotId,
    userId,
  });

  res.status(201).json(newReview);
});


/**** GET reviews by spot's id ****/
router.get("/:spotId/reviews", async (req, res) => {
  const { spotId } = req.params;
  const spot = await Spot.findByPk(req.params.spotId); // get spot id

  if (!spot) {
    return res.status(404).json({
      message: "Spot couldn't be found",
    });
  }

  const spotReviews = await Review.findAll({
    where: { spotId: spotId }, // thisTable[foreignKey] === otherTable[uniqueId]
    include: [
      {
        model: User,
        attributes: ["id", "firstName", "lastName"],
      },
      {
        model: ReviewImage,
        attributes: ["id", "url"],
      },
    ],
  });

  return res.status(200).json({ Reviews: spotReviews });
});
///////////////////////////////////////////////////////////////////////////////////////////////////////
/**** GET bookings by spot's id ****/
router.get("/:spotId/bookings", restoreUser, async (req, res) => {
  const { spotId } = req.params;
  const currentUserId = req.user.id;

  const spot = await Spot.findByPk(spotId); // get spot id

  if (!spot) {
    return res.status(404).json({
      message: "Spot couldn't be found",
    });
  }

  const spotBookings = await Booking.findAll({
    where: { spotId: spotId }, // Review.[foreignKey] matches Spot.[uniqueId]
    include: [
      {
        model: User,
        attributes: ["id", "firstName", "lastName"],
      },
    ],
  });

  if (spot.ownerId !== currentUserId) {
    // Capture non-owner booking information
    const nonOwnerBookings = spotBookings.map((booking) => ({
      spotId: booking.spotId,
      startDate: booking.startDate,
      endDate: booking.endDate,
    }));
    return res.status(200).json({ Bookings: nonOwnerBookings });
  }

  // Capture booking information
  const ownerBookings = spotBookings.map((booking) => ({
    User: {
      id: booking.User.id,
      firstName: booking.User.firstName,
      lastName: booking.User.lastName,
    },
    id: booking.id,
    spotId: booking.spotId,
    userId: booking.User.id,
    startDate: booking.startDate,
    endDate: booking.endDate,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  }));

  return res.status(200).json({ Bookings: ownerBookings });
});
/////////////////////////////////////////////////////////////////////////////////////////////
module.exports = router;