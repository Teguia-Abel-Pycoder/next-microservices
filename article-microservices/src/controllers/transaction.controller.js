// controllers/transaction.controller.js
const prisma = require('../prismaClient');
const { ValidationError } = require('../utils/errors');
const { serializeBigInt } = require('../utils/helpers');
const NotificationService = require('../services/notificationService');

/**
 * @swagger
 * /api/transactions/initiate:
 *   post:
 *     summary: Initiate a purchase transaction
 *     tags: [Transactions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - offerId
 *               - shippingAddress
 *             properties:
 *               offerId:
 *                 type: string
 *                 description: ID of the accepted offer
 *               shippingAddress:
 *                 type: object
 *                 properties:
 *                   fullName:
 *                     type: string
 *                   street:
 *                     type: string
 *                   city:
 *                     type: string
 *                   postalCode:
 *                     type: string
 *                   country:
 *                     type: string
 *     responses:
 *       201:
 *         description: Transaction initiated successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Offer not found
 *       500:
 *         description: Server error
 */
const initiateTransaction = async (req, res) => {
  try {
    const { offerId, shippingAddress } = req.body;
    const buyerUsername = req.headers['x-user-username'];

    if (!buyerUsername) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!offerId || !shippingAddress) {
      return res.status(400).json({
        success: false,
        message: 'Offer ID and shipping address are required'
      });
    }

    // Validate shipping address
    const requiredFields = ['fullName', 'street', 'city', 'postalCode', 'country'];
    for (const field of requiredFields) {
      if (!shippingAddress[field]?.trim()) {
        return res.status(400).json({
          success: false,
          message: `Shipping address field '${field}' is required`
        });
      }
    }

    const offerIdBigInt = BigInt(offerId);

    // Get the offer with article details
    const offer = await prisma.offer.findUnique({
      where: { id: offerIdBigInt },
      include: {
        article: true
      }
    });

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found'
      });
    }

    if (offer.username !== buyerUsername) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to purchase this item'
      });
    }

    if (offer.status !== 'ACCEPTED') {
      return res.status(400).json({
        success: false,
        message: 'Offer must be accepted before initiating transaction'
      });
    }

    // Check if transaction already exists
    const existingTransaction = await prisma.transaction.findFirst({
      where: { offerId: offerIdBigInt }
    });

    if (existingTransaction) {
      return res.status(400).json({
        success: false,
        message: 'Transaction already exists for this offer'
      });
    }

    // Simulate payment processing (replace with actual payment gateway)
    const paymentReference = `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create transaction
    const transaction = await prisma.transaction.create({
      data: {
        offerId: offerIdBigInt,
        articleId: offer.articleId,
        buyerUsername,
        sellerUsername: offer.seller,
        amount: offer.price,
        status: 'PAYMENT_PENDING',
        paymentReference,
        shippingAddress: JSON.stringify(shippingAddress),
        createdDate: new Date(),
        updatedDate: new Date()
      },
      include: {
        offer: {
          include: {
            article: true
          }
        }
      }
    });

    // Simulate payment processing delay
    setTimeout(async () => {
      try {
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'PAYMENT_CONFIRMED',
            paymentConfirmedAt: new Date(),
            updatedDate: new Date()
          }
        });

        // Update offer status
        await prisma.offer.update({
          where: { id: offerIdBigInt },
          data: {
            status: 'DONE',
            updatedDate: new Date()
          }
        });

        // Notify seller about payment confirmation
        await NotificationService.createNotification({
          userId: offer.seller,
          type: 'PAYMENT_CONFIRMED',
          title: 'Payment Received!',
          message: `Payment of $${offer.price} has been confirmed for "${offer.articleName}". Please prepare the item for shipping.`,
          data: {
            transactionId: transaction.id.toString(),
            articleId: offer.articleId.toString(),
            buyerUsername
          }
        });

        // Notify buyer about payment confirmation
        await NotificationService.createNotification({
          userId: buyerUsername,
          type: 'PAYMENT_CONFIRMED',
          title: 'Payment Confirmed',
          message: `Your payment of $${offer.price} for "${offer.articleName}" has been confirmed. The seller will ship the item soon.`,
          data: {
            transactionId: transaction.id.toString(),
            articleId: offer.articleId.toString(),
            sellerUsername: offer.seller
          }
        });

      } catch (error) {
        console.error('Error confirming payment:', error);
      }
    }, 3000); // 3 second delay to simulate payment processing

    res.status(201).json({
      success: true,
      message: 'Transaction initiated successfully. Payment is being processed.',
      data: {
        transaction: serializeBigInt(transaction),
        paymentReference,
        estimatedProcessingTime: '1-3 minutes'
      }
    });

  } catch (error) {
    console.error('Error initiating transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Error initiating transaction',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/transactions/{id}/ship:
 *   put:
 *     summary: Mark item as shipped
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - trackingNumber
 *               - carrier
 *             properties:
 *               trackingNumber:
 *                 type: string
 *               carrier:
 *                 type: string
 *               estimatedDelivery:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Item marked as shipped
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Transaction not found
 *       500:
 *         description: Server error
 */
const markAsShipped = async (req, res) => {
  try {
    const { id } = req.params;
    const { trackingNumber, carrier, estimatedDelivery } = req.body;
    const sellerUsername = req.headers['x-user-username'];

    if (!sellerUsername) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!trackingNumber || !carrier) {
      return res.status(400).json({
        success: false,
        message: 'Tracking number and carrier are required'
      });
    }

    const transactionId = BigInt(id);

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        offer: {
          include: {
            article: true
          }
        }
      }
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    if (transaction.sellerUsername !== sellerUsername) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this transaction'
      });
    }

    if (transaction.status !== 'PAYMENT_CONFIRMED') {
      return res.status(400).json({
        success: false,
        message: 'Transaction must have confirmed payment before shipping'
      });
    }

    // Update transaction
    const updatedTransaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'SHIPPED',
        trackingNumber,
        carrier,
        estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : null,
        shippedAt: new Date(),
        updatedDate: new Date()
      },
      include: {
        offer: {
          include: {
            article: true
          }
        }
      }
    });

    // Notify buyer about shipment
    await NotificationService.createNotification({
      userId: transaction.buyerUsername,
      type: 'ITEM_SHIPPED',
      title: 'Item Shipped!',
      message: `Your item "${transaction.offer.articleName}" has been shipped by ${carrier}. Tracking: ${trackingNumber}`,
      data: {
        transactionId: transaction.id.toString(),
        trackingNumber,
        carrier,
        estimatedDelivery
      }
    });

    res.json({
      success: true,
      message: 'Item marked as shipped successfully',
      data: {
        transaction: serializeBigInt(updatedTransaction),
        trackingInfo: {
          trackingNumber,
          carrier,
          estimatedDelivery
        }
      }
    });

  } catch (error) {
    console.error('Error marking as shipped:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating shipment status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/transactions/{id}/confirm-delivery:
 *   put:
 *     summary: Confirm item delivery and release payment
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               review:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Delivery confirmed and payment released
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Transaction not found
 *       500:
 *         description: Server error
 */
const confirmDelivery = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, review } = req.body;
    const buyerUsername = req.headers['x-user-username'];

    if (!buyerUsername) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const transactionId = BigInt(id);

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        offer: {
          include: {
            article: true
          }
        }
      }
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    if (transaction.buyerUsername !== buyerUsername) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this transaction'
      });
    }

    if (transaction.status !== 'SHIPPED') {
      return res.status(400).json({
        success: false,
        message: 'Item must be shipped before confirming delivery'
      });
    }

    // Simulate payment release to seller
    const releaseReference = `REL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Update transaction
    const updatedTransaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'COMPLETED',
        deliveryConfirmedAt: new Date(),
        paymentReleasedAt: new Date(),
        paymentReleaseReference: releaseReference,
        buyerRating: rating || null,
        buyerReview: review || null,
        updatedDate: new Date()
      },
      include: {
        offer: {
          include: {
            article: true
          }
        }
      }
    });

    // Mark article as bought
    await prisma.article.update({
      where: { id: transaction.articleId },
      data: {
        boughtBy: buyerUsername,
        published: false, // Remove from marketplace
        updatedDate: new Date()
      }
    });

    // Notify seller about payment release
    await NotificationService.createNotification({
      userId: transaction.sellerUsername,
      type: 'PAYMENT_RELEASED',
      title: 'Payment Released!',
      message: `Payment of $${transaction.amount} has been released for "${transaction.offer.articleName}". The transaction is now complete.`,
      data: {
        transactionId: transaction.id.toString(),
        amount: transaction.amount,
        releaseReference,
        buyerRating: rating,
        buyerReview: review
      }
    });

    // Notify buyer about completion
    await NotificationService.createNotification({
      userId: buyerUsername,
      type: 'TRANSACTION_COMPLETED',
      title: 'Transaction Complete!',
      message: `Your purchase of "${transaction.offer.articleName}" is now complete. Thank you for your business!`,
      data: {
        transactionId: transaction.id.toString(),
        articleId: transaction.articleId.toString()
      }
    });

    res.json({
      success: true,
      message: 'Delivery confirmed and payment released successfully',
      data: {
        transaction: serializeBigInt(updatedTransaction),
        paymentReleased: {
          amount: transaction.amount,
          reference: releaseReference,
          releasedAt: new Date()
        }
      }
    });

  } catch (error) {
    console.error('Error confirming delivery:', error);
    res.status(500).json({
      success: false,
      message: 'Error confirming delivery',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/transactions/{id}/dispute:
 *   put:
 *     summary: Open a dispute for a transaction
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *               - description
 *             properties:
 *               reason:
 *                 type: string
 *                 enum: [ITEM_NOT_RECEIVED, ITEM_NOT_AS_DESCRIBED, DAMAGED_ITEM, OTHER]
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *     responses:
 *       200:
 *         description: Dispute opened successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Transaction not found
 *       500:
 *         description: Server error
 */
const openDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, description } = req.body;
    const username = req.headers['x-user-username'];

    if (!username) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!reason || !description) {
      return res.status(400).json({
        success: false,
        message: 'Reason and description are required'
      });
    }

    const validReasons = ['ITEM_NOT_RECEIVED', 'ITEM_NOT_AS_DESCRIBED', 'DAMAGED_ITEM', 'OTHER'];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid dispute reason'
      });
    }

    const transactionId = BigInt(id);

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        offer: {
          include: {
            article: true
          }
        }
      }
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Only buyer or seller can open disputes
    if (transaction.buyerUsername !== username && transaction.sellerUsername !== username) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to dispute this transaction'
      });
    }

    if (transaction.status === 'COMPLETED' || transaction.status === 'DISPUTED') {
      return res.status(400).json({
        success: false,
        message: 'Cannot open dispute for this transaction status'
      });
    }

    // Update transaction status
    const updatedTransaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'DISPUTED',
        disputeReason: reason,
        disputeDescription: description,
        disputeOpenedBy: username,
        disputeOpenedAt: new Date(),
        updatedDate: new Date()
      },
      include: {
        offer: {
          include: {
            article: true
          }
        }
      }
    });

    // Notify the other party
    const otherParty = username === transaction.buyerUsername 
      ? transaction.sellerUsername 
      : transaction.buyerUsername;

    await NotificationService.createNotification({
      userId: otherParty,
      type: 'TRANSACTION_DISPUTED',
      title: 'Transaction Disputed',
      message: `A dispute has been opened for "${transaction.offer.articleName}". Reason: ${reason}`,
      data: {
        transactionId: transaction.id.toString(),
        disputeReason: reason,
        disputeDescription: description,
        disputeOpenedBy: username
      }
    });

    // Notify admin/support (you would have admin users in a real system)
    await NotificationService.createNotification({
      userId: 'admin', // Replace with actual admin user handling
      type: 'DISPUTE_OPENED',
      title: 'New Dispute Opened',
      message: `Transaction ${transaction.id} disputed: ${reason}`,
      data: {
        transactionId: transaction.id.toString(),
        disputeReason: reason,
        disputeDescription: description,
        disputeOpenedBy: username,
        buyerUsername: transaction.buyerUsername,
        sellerUsername: transaction.sellerUsername
      }
    });

    res.json({
      success: true,
      message: 'Dispute opened successfully',
      data: {
        transaction: serializeBigInt(updatedTransaction),
        dispute: {
          reason,
          description,
          openedBy: username,
          openedAt: new Date()
        }
      }
    });

  } catch (error) {
    console.error('Error opening dispute:', error);
    res.status(500).json({
      success: false,
      message: 'Error opening dispute',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/transactions:
 *   get:
 *     summary: Get user's transactions
 *     tags: [Transactions]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ALL, PAYMENT_PENDING, PAYMENT_CONFIRMED, SHIPPED, COMPLETED, DISPUTED]
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [buyer, seller, all]
 *           default: all
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
const getUserTransactions = async (req, res) => {
  try {
    const username = req.headers['x-user-username'];
    const { page = 1, limit = 10, status = 'ALL', role = 'all' } = req.query;

    if (!username) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    let where = {};

    // Filter by role
    if (role === 'buyer') {
      where.buyerUsername = username;
    } else if (role === 'seller') {
      where.sellerUsername = username;
    } else {
      where.OR = [
        { buyerUsername: username },
        { sellerUsername: username }
      ];
    }

    // Filter by status
    if (status !== 'ALL') {
      where.status = status;
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          offer: {
            include: {
              article: {
                select: {
                  id: true,
                  name: true,
                  mainImage: true,
                  category: true
                }
              }
            }
          }
        },
        orderBy: {
          createdDate: 'desc'
        },
        skip,
        take: parseInt(limit)
      }),
      prisma.transaction.count({ where })
    ]);

    res.json({
      success: true,
      data: serializeBigInt(transactions),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error retrieving user transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving transactions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/transactions/{id}:
 *   get:
 *     summary: Get transaction details by ID
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *     responses:
 *       200:
 *         description: Transaction details retrieved
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Transaction not found
 *       500:
 *         description: Server error
 */
const getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;
    const username = req.headers['x-user-username'];

    if (!username) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const transactionId = BigInt(id);

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        offer: {
          include: {
            article: true
          }
        }
      }
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Check if user is involved in this transaction
    if (transaction.buyerUsername !== username && transaction.sellerUsername !== username) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this transaction'
      });
    }

    res.json({
      success: true,
      data: serializeBigInt(transaction)
    });

  } catch (error) {
    console.error('Error retrieving transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving transaction',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/transactions/stats:
 *   get:
 *     summary: Get user's transaction statistics
 *     tags: [Transactions]
 *     responses:
 *       200:
 *         description: Transaction statistics retrieved
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
const getTransactionStats = async (req, res) => {
  try {
    const username = req.headers['x-user-username'];

    if (!username) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const TransactionService = require('../services/transactionService');
    const stats = await TransactionService.getUserTransactionStats(username);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error retrieving transaction stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving transaction statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/transactions/{id}/cancel:
 *   put:
 *     summary: Cancel a transaction (buyer only, payment pending status)
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *     responses:
 *       200:
 *         description: Transaction cancelled successfully
 *       400:
 *         description: Cannot cancel transaction in current status
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized to cancel this transaction
 *       404:
 *         description: Transaction not found
 *       500:
 *         description: Server error
 */
const cancelTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const username = req.headers['x-user-username'];

    if (!username) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const transactionId = BigInt(id);

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        offer: {
          include: {
            article: true
          }
        }
      }
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    if (transaction.buyerUsername !== username) {
      return res.status(403).json({
        success: false,
        message: 'Only the buyer can cancel a transaction'
      });
    }

    if (transaction.status !== 'PAYMENT_PENDING') {
      return res.status(400).json({
        success: false,
        message: 'Can only cancel transactions with pending payment'
      });
    }

    // Update transaction status
    const updatedTransaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'CANCELLED',
        updatedDate: new Date()
      }
    });

    // Update offer back to ACCEPTED
    await prisma.offer.update({
      where: { id: transaction.offerId },
      data: {
        status: 'ACCEPTED',
        updatedDate: new Date()
      }
    });

    // Notify seller
    await NotificationService.createNotification({
      userId: transaction.sellerUsername,
      type: 'TRANSACTION_CANCELLED',
      title: 'Transaction Cancelled',
      message: `The buyer cancelled the transaction for "${transaction.offer.articleName}".`,
      data: {
        transactionId: transaction.id.toString(),
        reason: 'buyer_cancelled'
      }
    });

    res.json({
      success: true,
      message: 'Transaction cancelled successfully',
      data: serializeBigInt(updatedTransaction)
    });

  } catch (error) {
    console.error('Error cancelling transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling transaction',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  initiateTransaction,
  markAsShipped,
  confirmDelivery,
  openDispute,
  getUserTransactions,
  getTransactionById,
  getTransactionStats,
  cancelTransaction
};