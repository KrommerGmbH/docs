import { defineComponent } from 'vue';
import type { NotificationType, NotificationVariant } from '../store/notification.store';
import { createNotificationService } from '../service/notification.service';

/**
 * Mixin: notification
 * Provides createNotification helper methods for Vue components.
 *
 * Usage:
 * mixins: [NotificationMixin],
 *
 * this.createNotificationSuccess({ message: 'Saved!' })
 */
const NotificationMixin = defineComponent({
    methods: {
        createNotification(notification: NotificationType): string | null {
            const notificationService = createNotificationService(this.$t ? ((key: string) => this.$t(key) as string) : undefined);
            return notificationService.notify(notification);
        },

        createNotificationSuccess(config: NotificationType): void {
            const notificationService = createNotificationService(this.$t ? ((key: string) => this.$t(key) as string) : undefined);
            notificationService.success(config);
        },

        createNotificationInfo(config: NotificationType): void {
            const notificationService = createNotificationService(this.$t ? ((key: string) => this.$t(key) as string) : undefined);
            notificationService.info(config);
        },

        createNotificationWarning(config: NotificationType): void {
            const notificationService = createNotificationService(this.$t ? ((key: string) => this.$t(key) as string) : undefined);
            notificationService.warning(config);
        },

        createNotificationError(config: NotificationType): void {
            const notificationService = createNotificationService(this.$t ? ((key: string) => this.$t(key) as string) : undefined);
            notificationService.error(config);
        },

        createSaveSuccessNotification(config: NotificationType = {}): void {
            this.createNotificationSuccess({
                title: (this.$t ? this.$t('cmh-global.notification.saveSuccessTitle') : '') as string,
                message: (this.$t ? this.$t('cmh-global.notification.saveSuccessMessage') : '') as string,
                ...config,
            });
        },

        createSaveErrorNotification(config: NotificationType = {}): void {
            this.createNotificationError({
                title: (this.$t ? this.$t('cmh-global.notification.saveErrorTitle') : '') as string,
                message: (this.$t ? this.$t('cmh-global.notification.saveErrorMessage') : '') as string,
                ...config,
            });
        },

        createSystemNotificationSuccess(config: NotificationType): void {
            this.createNotification({ variant: 'success' as NotificationVariant, system: true, ...config });
        },

        createSystemNotificationInfo(config: NotificationType): void {
            this.createNotification({ variant: 'info', system: true, ...config });
        },

        createSystemNotificationWarning(config: NotificationType): void {
            this.createNotification({ variant: 'warning', system: true, ...config });
        },

        createSystemNotificationError(config: NotificationType): void {
            this.createNotification({ variant: 'error', system: true, ...config });
        },

        createSystemNotification(config: NotificationType): void {
            this.createNotification({ system: true, ...config });
        },
    },
});

export default NotificationMixin;
export type { NotificationType, NotificationVariant };
