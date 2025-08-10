// services/notificationService.js - Fixed version
const prisma = require('../prismaClient');

class NotificationService {
  /**
   * Create and send notification
   */
  static async createNotification({
    userId,
    type,
    title,
    message,
    data = null,
    sendSSE = true
  }) {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId,
          type,
          title,
          message,
          data: data ? JSON.stringify(data) : null
        }
      });

      // Send real-time notification via SSE
      if (sendSSE) {
        // Import SSE manager here to avoid circular dependency
        const { sendToSeller } = require('../SSE/sseManager');
        
        sendToSeller(userId, {
          type: 'NEW_NOTIFICATION',
          payload: {
            id: notification.id.toString(),
            type: notification.type,
            title: notification.title,
            message: notification.message,
            data: notification.data,
            createdDate: notification.createdDate,
            read: false
          }
        });
      }

      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Create offer-related notifications
   */
  static async createOfferNotification(offer, notificationType, customMessage = null) {
    const notificationTemplates = {
      NEW_OFFER: {
        seller: {
          title: 'New Offer Received',
          message: `${offer.username} made an offer of $${offer.price} for your ${offer.articleName}`
        }
      },
      OFFER_UPDATED: {
        seller: {
          title: 'Offer Updated',
          message: `${offer.username} updated their offer to $${offer.price} for your ${offer.articleName}`
        }
      },
      OFFER_ACCEPTED: {
        buyer: {
          title: 'Offer Accepted!',
          message: `Your offer of $${offer.price} for ${offer.articleName} has been accepted`
        }
      },
      OFFER_DENIED: {
        buyer: {
          title: 'Offer Declined',
          message: `Your offer of $${offer.price} for ${offer.articleName} has been declined`
        }
      },
      OFFER_CANCELLED: {
        seller: {
          title: 'Offer Cancelled',
          message: `The offer from ${offer.username} for ${offer.articleName} has been cancelled`
        }
      },
      OFFER_CONCLUDED: {
        seller: {
          title: 'Transaction Completed',
          message: `Transaction completed! ${offer.username} has confirmed receipt of ${offer.articleName}`
        }
      }
    };

    const template = notificationTemplates[notificationType];
    if (!template) {
      console.error(`Unknown notification type: ${notificationType}`);
      return;
    }

    const notifications = [];

    // Create notifications for different recipients
    for (const [recipient, config] of Object.entries(template)) {
      let userId;
      
      switch (recipient) {
        case 'seller':
          userId = offer.seller;
          break;
        case 'buyer':
          userId = offer.username;
          break;
        default:
          continue;
      }

      try {
        const notification = await this.createNotification({
          userId,
          type: notificationType,
          title: config.title,
          message: customMessage || config.message,
          data: {
            offerId: offer.id.toString(),
            articleId: offer.articleId.toString(),
            articleName: offer.articleName,
            price: offer.price,
            mainImage: offer.mainImage,
            status: offer.status
          }
        });

        notifications.push(notification);
      } catch (error) {
        console.error(`Error creating notification for ${recipient}:`, error);
      }
    }

    return notifications;
  }

  /**
   * Clean up old notifications (older than 30 days)
   */
  static async cleanupOldNotifications() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await prisma.notification.deleteMany({
        where: {
          createdDate: {
            lt: thirtyDaysAgo
          },
          read: true // Only delete read notifications
        }
      });

      console.log(`🧹 Cleaned up ${result.count} old notifications`);
      return result.count;
    } catch (error) {
      console.error('Error cleaning up notifications:', error);
      throw error;
    }
  }

  /**
   * Get unread notification count for user
   */
  static async getUnreadCount(userId) {
    try {
      return await prisma.notification.count({
        where: {
          userId,
          read: false
        }
      });
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Send system-wide notifications
   */
  static async createSystemNotification({
    userIds = [], // Array of user IDs, empty for all users
    type = 'SYSTEM_MESSAGE',
    title,
    message,
    data = null
  }) {
    try {
      let targetUsers = userIds;

      // If no specific users provided, get all users
      if (userIds.length === 0) {
        const users = await prisma.article.findMany({
          select: { owner: true },
          distinct: ['owner']
        });
        targetUsers = users.map(user => user.owner);
      }

      const notifications = [];

      for (const userId of targetUsers) {
        try {
          const notification = await this.createNotification({
            userId,
            type,
            title,
            message,
            data
          });
          notifications.push(notification);
        } catch (error) {
          console.error(`Error creating system notification for user ${userId}:`, error);
        }
      }

      console.log(`📢 Created ${notifications.length} system notifications`);
      return notifications;
    } catch (error) {
      console.error('Error creating system notifications:', error);
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId, userId) {
    try {
      const notification = await prisma.notification.findFirst({
        where: {
          id: BigInt(notificationId),
          userId: userId
        }
      });

      if (!notification) {
        throw new Error('Notification not found');
      }

      if (notification.read) {
        return notification;
      }

      return await prisma.notification.update({
        where: { id: BigInt(notificationId) },
        data: {
          read: true,
          updatedDate: new Date()
        }
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for user
   */
  static async markAllAsRead(userId) {
    try {
      return await prisma.notification.updateMany({
        where: {
          userId: userId,
          read: false
        },
        data: {
          read: true,
          updatedDate: new Date()
        }
      });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Delete notification
   */
  static async deleteNotification(notificationId, userId) {
    try {
      const notification = await prisma.notification.findFirst({
        where: {
          id: BigInt(notificationId),
          userId: userId
        }
      });

      if (!notification) {
        throw new Error('Notification not found');
      }

      return await prisma.notification.delete({
        where: { id: BigInt(notificationId) }
      });
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw error;
    }
  }
}

module.exports = NotificationService;