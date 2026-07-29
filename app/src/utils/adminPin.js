const KEY_PREFIX = 'skorbord_admin_pin_'

export function getStoredAdminPin(sqid) {
  return sessionStorage.getItem(KEY_PREFIX + sqid)
}

export function setStoredAdminPin(sqid, pin) {
  sessionStorage.setItem(KEY_PREFIX + sqid, pin)
}

export function clearStoredAdminPin(sqid) {
  sessionStorage.removeItem(KEY_PREFIX + sqid)
}
