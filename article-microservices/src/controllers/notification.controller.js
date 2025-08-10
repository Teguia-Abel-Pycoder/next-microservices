// controllers/notification.controller.js
const prisma = require('../prismaClient');
const { serializeBigInt } = require('../utils/helpers');

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Get user notifications
 *     tags: [Notifications]
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
 *           default: 20
 *       - in: query
 *         name: unreadOnly
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           description: Filter by notification type
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 *       401:
 *         description: Unauthorized
 */
const getUserNotifications = async (req, res) => {
  try {
    const username = req.headers['x-user-username'];
    const { page = 1, limit = 20, unreadOnly = false, type } = req.query;

    // Parse and validate pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20)); // Cap at 100
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where = { userId: username };

    if (unreadOnly === 'true') {
      where.read = false;
    }

    if (type) {
      where.type = type.toUpperCase();
    }

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdDate: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ 
        where: { userId: username, read: false } 
      })
    ]);

    res.json({
      success: true,
      data: serializeBigInt(notifications),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1
      },
      unreadCount
    });

  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /notifications/{id}/read:
 *   patch:
 *     summary: Mark notification as read
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       404:
 *         description: Notification not found
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const username = req.headers['x-user-username'];

    // Validate ID format
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID format'
      });
    }

    const notification = await prisma.notification.findFirst({
      where: { 
        id: BigInt(id),
        userId: username
      }
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // If already read, don't update
    if (notification.read) {
      return res.json({
        success: true,
        message: 'Notification already marked as read',
        data: serializeBigInt(notification)
      });
    }

    const updatedNotification = await prisma.notification.update({
      where: { id: BigInt(id) },
      data: { 
        read: true,
        updatedDate: new Date()
      }
    });

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: serializeBigInt(updatedNotification)
    });

  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating notification',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /notifications/mark-all-read:
 *   patch:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
const markAllAsRead = async (req, res) => {
  try {
    const username = req.headers['x-user-username'];

    const result = await prisma.notification.updateMany({
      where: { 
        userId: username,
        read: false
      },
      data: { 
        read: true,
        updatedDate: new Date()
      }
    });

    res.json({
      success: true,
      message: `${result.count} notifications marked as read`,
      count: result.count
    });

  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating notifications',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /notifications/{id}:
 *   delete:
 *     summary: Delete notification
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification deleted
 *       404:
 *         description: Notification not found
 */
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const username = req.headers['x-user-username'];

    // Validate ID format
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID format'
      });
    }

    const notification = await prisma.notification.findFirst({
      where: { 
        id: BigInt(id),
        userId: username
      }
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    await prisma.notification.delete({
      where: { id: BigInt(id) }
    });

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting notification',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /notifications/stats:
 *   get:
 *     summary: Get notification statistics for user
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 */
const getNotificationStats = async (req, res) => {
  try {
    const username = req.headers['x-user-username'];

    const [stats, recentCount] = await Promise.all([
      prisma.notification.groupBy({
        by: ['type', 'read'],
        where: { userId: username },
        _count: { id: true }
      }),
      prisma.notification.count({
        where: {
          userId: username,
          createdDate: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      })
    ]);

    const formattedStats = {
      total: 0,
      unread: 0,
      recentCount: recentCount,
      byType: {}
    };

    stats.forEach(stat => {
      const count = stat._count.id;
      formattedStats.total += count;
      
      if (!stat.read) {
        formattedStats.unread += count;
      }

      if (!formattedStats.byType[stat.type]) {
        formattedStats.byType[stat.type] = { total: 0, unread: 0 };
      }
      
      formattedStats.byType[stat.type].total += count;
      if (!stat.read) {
        formattedStats.byType[stat.type].unread += count;
      }
    });

    res.json({
      success: true,
      data: formattedStats
    });

  } catch (error) {
    console.error('Error fetching notification stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotificationStats
};