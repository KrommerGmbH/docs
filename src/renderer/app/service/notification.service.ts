import { useNotificationStore, type NotificationType, type NotificationVariant } from '../store/notification.store'

type Translator = (key: string) => string

function resolveTitle(t: Translator | undefined, key: string): string {
  if (!t) {
    return key
  }
  const translated = t(key)
  return typeof translated === 'string' ? translated : key
}

export function createNotificationService(t?: Translator) {
  const store = useNotificationStore()

  const notify = (notification: NotificationType): string => store.createNotification(notification)

  const notifyByVariant = (variant: NotificationVariant, defaultTitleKey: string, config: NotificationType): string => {
    return notify({
      variant,
      title: resolveTitle(t, defaultTitleKey),
      ...config,
    })
  }

  return {
    notify,
    success(config: NotificationType): string {
      return notifyByVariant('success', 'cmh-global.default.success', config)
    },
    info(config: NotificationType): string {
      return notifyByVariant('info', 'cmh-global.default.info', config)
    },
    warning(config: NotificationType): string {
      return notifyByVariant('warning', 'cmh-global.default.warning', config)
    },
    error(config: NotificationType): string {
      return notifyByVariant('error', 'cmh-global.default.error', config)
    },
    system(config: NotificationType): string {
      return notify({ system: true, ...config })
    },
  }
}
