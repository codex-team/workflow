/**
 * Useful methods
 */
class Utils {
  /**
   * Trim long strings and add '…'
   *
   * @param {string} inputString - string to be trimmed
   * @param {number} maxLenght - max string length
   * @returns {string|*}
   */
  static trimString(inputString, maxLenght) {
    return maxLenght && (inputString.length > maxLenght)
      ? inputString.substring(0, maxLenght - 1) + '…'
      : inputString;
  }

  /**
   *
   * @param {object} obj - object to be checked.
   * @param {string} property - property that need to be checked.
   * @param  {...any} rest - higher level property that need to be checked.
   * @returns {boolean}
   */
  static isPropertyExist(obj, property, ...rest) {
    if (obj === undefined) {
      return false;
    }
    if (rest.length == 0 && Object.prototype.hasOwnProperty.call(obj, property)) {
      return true;
    }

    return Utils.isPropertyExist(obj[property], ...rest);
  }
}

module.exports = Utils;
