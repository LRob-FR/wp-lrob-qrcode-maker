<?php
/**
 * Plugin Name: LRob - QR Code Maker
 * Plugin URI: https://www.lrob.fr/wordpress/plugins/qr-code-maker/
 * Description: Customizable QR codes for WordPress — public Gutenberg block for visitors to create and download their own, admin library with optional scan tracking. Browser-side rendering, no server round-trip. Logos picked from the Media Library (admin) or kept in the visitor's browser only (public block).
 * Version: 1.0.0
 * Author: LRob
 * Author URI: https://www.lrob.fr
 * License: GPL-2.0+
 * License URI: http://www.gnu.org/licenses/gpl-2.0.txt
 * Text Domain: lrob-qrcode-maker
 * Domain Path: /languages
 * Requires PHP: 8.3
 * Requires at least: 6.0
 *
 * Built by LRob — https://www.lrob.fr
 *
 * Rendering powered by qr-code-styling © Denys Kozak (kozakdenys), MIT.
 *   https://github.com/kozakdenys/qr-code-styling
 *   See vendor/qr-code-styling/LICENSE for the upstream notice.
 */

if (!defined('ABSPATH')) {
    exit;
}

define('LROB_QRM_VERSION', '1.0.0');
define('LROB_QRM_FILE', __FILE__);
define('LROB_QRM_PATH', plugin_dir_path(__FILE__));
define('LROB_QRM_URL', plugin_dir_url(__FILE__));
define('LROB_QRM_BASENAME', plugin_basename(__FILE__));
define('LROB_QRM_PLUGIN_URL', 'https://www.lrob.fr/wordpress/plugins/qr-code-maker/');
define('LROB_QRM_GITHUB_URL', 'https://github.com/LRob-FR/wp-lrob-qrcode-maker');
define('LROB_QRM_GITHUB_ISSUES_URL', LROB_QRM_GITHUB_URL . '/issues');

// PSR-4 autoloader for plugin code: LRob\QRCodeMaker\Foo\Bar -> src/Foo/Bar.php
spl_autoload_register(function (string $class): void {
    $prefix = 'LRob\\QRCodeMaker\\';
    $base_dir = LROB_QRM_PATH . 'src/';

    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) {
        return;
    }

    $relative = substr($class, $len);
    $file = $base_dir . str_replace('\\', DIRECTORY_SEPARATOR, $relative) . '.php';

    if (is_file($file)) {
        require_once $file;
    }
});

register_activation_hook(__FILE__, [\LRob\QRCodeMaker\Activator::class, 'activate']);
register_deactivation_hook(__FILE__, [\LRob\QRCodeMaker\Deactivator::class, 'deactivate']);

add_action('plugins_loaded', static function (): void {
    \LRob\QRCodeMaker\Plugin::instance()->boot();
});
