// controllers/offer.controller.js
const prisma = require('../prismaClient');
const { serializeBigInt } = require('../utils/helpers');
const { sendToSeller } = require('../SSE/sseManager'); // Fixed import
const NotificationService = require('../services/notificationService');

/**
 * @swagger
 * /offer/create:
 *   post:
 *     summary: Create a new offer for an article
 *     tags: [Offers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - articleId
 *               - price
 *             properties:
 *               articleId:
 *                 type: string
 *               price:
 *                 type: number
 *                 minimum: 0
 *     responses:
 *       201:
 *         description: Offer created successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Article not found
 *       409:
 *         description: Offer already exists
 *       500:
 *         description: Server error
 */
const createOffer = async (req, res) => {
  try {
    const { articleId, price } = req.body;
    const username = req.headers['x-user-username'];

    // Validation
    if (!username) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required' 
      });
    }

    if (!articleId || !price) {
      return res.status(400).json({ 
        success: false,
        message: 'Article ID and price are required',
        errors: {
          articleId: !articleId ? 'Article ID is required' : null,
          price: !price ? 'Price is required' : null
        }
      });
    }

    const offerPrice = parseFloat(price);
    if (isNaN(offerPrice) || offerPrice <= 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Price must be a valid positive number' 
      });
    }

    // Validate articleId format
    if (isNaN(parseInt(articleId))) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid article ID format' 
      });
    }

    const articleBigIntId = BigInt(articleId);

    // Get the article with error handling
    const article = await prisma.article.findUnique({
      where: { id: articleBigIntId },
    });

    if (!article) {
      return res.status(404).json({ 
        success: false,
        message: 'Article not found' 
      });
    }

    if (!article.published) {
      return res.status(400).json({ 
        success: false,
        message: 'Cannot make offers on unpublished articles' 
      });
    }

    // Check if user is trying to make offer on their own article
    if (article.owner === username) {
      return res.status(400).json({ 
        success: false,
        message: 'You cannot make an offer on your own article' 
      });
    }

    // Check for existing offer from this user
    const existingOffer = await prisma.offer.findUnique({
      where: {
        articleId_username: {
          articleId: articleBigIntId,
          username: username
        }
      }
    });

    if (existingOffer) {
      // Update existing offer
      const updatedOffer = await prisma.offer.update({
        where: { id: existingOffer.id },
        data: {
          price: offerPrice,
          status: 'PENDING', // Reset status when updating offer
          updatedDate: new Date()
        },
        include: {
          article: {
            select: {
              name: true,
              category: true,
              size: true,
              mainImage: true,
              owner: true
            }
          }
        }
      });

      const serialized = serializeBigInt(updatedOffer);

      // Send SSE notification to seller
      try {
        sendToSeller(article.owner, {
          type: 'OFFER_UPDATED',
          payload: serialized,
        });

        // Create notification
        await NotificationService.createOfferNotification(updatedOffer, 'OFFER_UPDATED');
      } catch (notificationError) {
        console.error('Error sending notification for updated offer:', notificationError);
        // Don't fail the request if notification fails
      }

      return res.status(200).json({
        success: true,
        message: 'Offer updated successfully',
        data: serialized
      });
    }

    // Create new offer
    const offer = await prisma.offer.create({
      data: {
        articleId: articleBigIntId,
        articleName: article.name,
        price: offerPrice,
        articleCategory: article.category,
        articleSize: article.size,
        seller: article.owner,
        username,
        status: 'PENDING',
        mainImage: article.mainImage,
      },
      include: {
        article: {
          select: {
            name: true,
            category: true,
            size: true,
            mainImage: true,
            owner: true
          }
        }
      }
    });

    const serialized = serializeBigInt(offer);

    // Send SSE notification to seller
    try {
      sendToSeller(article.owner, {
        type: 'NEW_OFFER',
        payload: serialized,
      });

      // Create notification
      await NotificationService.createOfferNotification(offer, 'NEW_OFFER');
    } catch (notificationError) {
      console.error('Error sending notification for new offer:', notificationError);
      // Don't fail the request if notification fails
    }

    res.status(201).json({
      success: true,
      message: 'Offer created successfully',
      data: serialized
    });

  } catch (error) {
    console.error('Error creating offer:', error);
    
    if (error.code === 'P2002') {
      return res.status(409).json({ 
        success: false,
        message: 'An offer from this user already exists for this article' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Error creating offer',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update offer status by seller (accept/deny)
 */
const updateOfferStatusBySeller = async (req, res) => {
  try {
    const { offerId } = req.params;
    const { action } = req.body;
    const seller = req.headers['x-user-username'];

    if (!seller) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required' 
      });
    }

    if (!['ACCEPTED', 'DENIED'].includes(action)) {
      return res.status(400).json({ 
        success: false,
        message: 'Action must be ACCEPTED or DENIED' 
      });
    }

    if (!offerId || isNaN(parseInt(offerId))) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid offer ID format' 
      });
    }

    const offer = await prisma.offer.findUnique({
      where: { id: BigInt(offerId) },
      include: {
        article: {
          select: {
            name: true,
            owner: true
          }
        }
      }
    });

    if (!offer) {
      return res.status(404).json({ 
        success: false,
        message: 'Offer not found' 
      });
    }

    // if (offer.username !== seller) {
    //   return res.status(403).json({ 
    //     success: false,
    //     message: 'You are not authorized to cancel this offer' 
    //   });
    // }

    if (!['PENDING', 'ACCEPTED'].includes(offer.status)) {
      return res.status(400).json({ 
        success: false,
        message: 'Only pending or accepted offers can be cancelled' 
      });
    }

    const cancelledOffer = await prisma.offer.update({
      where: { id: BigInt(offerId) },
      data: { 
        status: 'CANCELLED',
        updatedDate: new Date()
      },
      include: {
        article: {
          select: {
            name: true,
            category: true,
            size: true,
            mainImage: true
          }
        }
      }
    });

    // Send notification to seller
    try {
      sendToSeller(offer.seller, {
        type: 'OFFER_CANCELLED',
        payload: {
          ...serializeBigInt(cancelledOffer),
          message: 'Offer has been cancelled by the buyer'
        }
      });

      // Create notification
      await NotificationService.createOfferNotification(cancelledOffer, 'OFFER_CANCELLED');
    } catch (notificationError) {
      console.error('Error sending offer cancellation notification:', notificationError);
    }

    res.status(200).json({
      success: true,
      message: 'Offer cancelled successfully',
      data: serializeBigInt(cancelledOffer)
    });

  } catch (error) {
    console.error('Error cancelling offer:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error cancelling offer',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
/**
 * Conclude offer by buyer (mark as done)
 */
const concludeOfferByUser = async (req, res) => {
  try {
    const { offerId } = req.params;
    const username = req.headers['x-user-username'];

    if (!username) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required' 
      });
    }

    if (!offerId || isNaN(parseInt(offerId))) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid offer ID format' 
      });
    }

    const offer = await prisma.offer.findUnique({
      where: { id: BigInt(offerId) },
      include: {
        article: {
          select: {
            name: true,
            owner: true
          }
        }
      }
    });

    if (!offer) {
      return res.status(404).json({ 
        success: false,
        message: 'Offer not found' 
      });
    }

    if (offer.username !== username) {
      return res.status(403).json({ 
        success: false,
        message: 'You are not authorized to conclude this offer' 
      });
    }

    if (offer.status !== 'ACCEPTED') {
      return res.status(400).json({ 
        success: false,
        message: 'Only accepted offers can be concluded' 
      });
    }

    // Start transaction to update offer and article
    const result = await prisma.$transaction(async (tx) => {
      // Update offer status
      const updatedOffer = await tx.offer.update({
        where: { id: BigInt(offerId) },
        data: { 
          status: 'DONE',
          updatedDate: new Date()
        },
        include: {
          article: {
            select: {
              name: true,
              category: true,
              size: true,
              mainImage: true
            }
          }
        }
      });

      // Update article as sold
      await tx.article.update({
        where: { id: offer.articleId },
        data: {
          boughtBy: username,
          published: false, // Unpublish sold item
          updatedDate: new Date()
        }
      });

      return updatedOffer;
    });

    // Send notification to seller
    sendToSeller(offer.seller, {
      type: 'OFFER_CONCLUDED',
      payload: {
        ...serializeBigInt(result),
        message: 'Transaction completed successfully'
      }
    });
    // Create notification
    await NotificationService.createOfferNotification(result, 'OFFER_CONCLUDED');

    res.status(200).json({
      success: true,
      message: 'Offer concluded successfully',
      data: serializeBigInt(result)
    });

  } catch (error) {
    console.error('Error concluding offer:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error concluding offer',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get offers received by seller
 */
const getOffersBySeller = async (req, res) => {
  try {
    const { sellerName } = req.params;
    const { page = 1, limit = 10, status } = req.query;
    const currentUser = req.headers['x-user-username'];

    // Only allow users to see their own offers unless admin
    if (currentUser !== sellerName && !req.user?.isAdmin) {
      return res.status(403).json({ 
        success: false,
        message: 'You can only view your own offers' 
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = { seller: sellerName };

    if (status) {
      where.status = status.toUpperCase();
    }

    const [offers, total] = await Promise.all([
      prisma.offer.findMany({
        where,
        include: {
          article: {
            select: {
              name: true,
              category: true,
              size: true,
              mainImage: true,
              published: true
            }
          }
        },
        orderBy: {
          createdDate: 'desc'
        },
        skip,
        take: parseInt(limit)
      }),
      prisma.offer.count({ where })
    ]);

    if (!offers.length && page === 1) {
      return res.status(404).json({ 
        success: false,
        message: `No offers found for seller: ${sellerName}` 
      });
    }

    res.json({
      success: true,
      data: serializeBigInt(offers),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching offers by seller:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get offers made by user (buyer)
 */
const getOffersByUsername = async (req, res) => {
  try {
    const { userName } = req.params;
    const { page = 1, limit = 10, status } = req.query;
    const currentUser = req.headers['x-user-username'];

    // Only allow users to see their own offers unless admin
    if (currentUser !== userName && !req.user?.isAdmin) {
      return res.status(403).json({ 
        success: false,
        message: 'You can only view your own offers' 
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = { username: userName };

    if (status) {
      where.status = status.toUpperCase();
    }

    const [offers, total] = await Promise.all([
      prisma.offer.findMany({
        where,
        include: {
          article: {
            select: {
              name: true,
              category: true,
              size: true,
              mainImage: true,
              published: true,
              owner: true
            }
          }
        },
        orderBy: {
          createdDate: 'desc'
        },
        skip,
        take: parseInt(limit)
      }),
      prisma.offer.count({ where })
    ]);

    if (!offers.length && page === 1) {
      return res.status(404).json({ 
        success: false,
        message: `No offers found for user: ${userName}` 
      });
    }

    res.json({
      success: true,
      data: serializeBigInt(offers),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching offers by username:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Cancel offer by user (buyer)
 */
const cancelOfferByUser = async (req, res) => {
  try {
    const { offerId } = req.params;
    const username = req.headers['x-user-username'];

    if (!username) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required' 
      });
    }

    if (!offerId || isNaN(parseInt(offerId))) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid offer ID format' 
      });
    }

    const offer = await prisma.offer.findUnique({
      where: { id: BigInt(offerId) },
    });

    if (!offer) {
      return res.status(404).json({ 
        success: false,
        message: 'Offer not found' 
      });
    }

    if (offer.username !== username) {
      return res.status(403).json({ 
        success: false,
        message: 'You are not authorized to cancel this offer' 
      });
    }

    if (!['PENDING', 'ACCEPTED'].includes(offer.status)) {
      return res.status(400).json({ 
        success: false,
        message: 'Only pending or accepted offers can be cancelled' 
      });
    }

    const cancelledOffer = await prisma.offer.update({
      where: { id: BigInt(offerId) },
      data: { 
        status: 'CANCELLED',
        updatedDate: new Date()
      },
      include: {
        article: {
          select: {
            name: true,
            category: true,
            size: true,
            mainImage: true
          }
        }
      }
    });

    // Send notification to seller
    sendToSeller(offer.seller, {
      type: 'OFFER_CANCELLED',
      payload: {
        ...serializeBigInt(cancelledOffer),
        message: 'Offer has been cancelled by the buyer'
      }
    });

    // Create notification
    await NotificationService.createOfferNotification(cancelledOffer, 'OFFER_CANCELLED');


    res.status(200).json({
      success: true,
      message: 'Offer cancelled successfully',
      data: serializeBigInt(cancelledOffer)
    });

  } catch (error) {
    console.error('Error cancelling offer:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error cancelling offer',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = { 
  createOffer, 
  updateOfferStatusBySeller, 
  concludeOfferByUser, 
  getOffersBySeller, 
  getOffersByUsername,
  cancelOfferByUser
};

