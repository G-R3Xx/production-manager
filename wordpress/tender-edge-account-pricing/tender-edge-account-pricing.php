<?php
/**
 * Plugin Name: Tender Edge Account Pricing
 * Description: Carries logged-in WooCommerce customer identity into Production Manager live pricing so MYOB Level A-F pricing is used consistently on product pages and Add to Cart.
 * Version: 1.0.0
 * Author: Tender Edge
 */

if (!defined('ABSPATH')) exit;

final class TE_Account_Pricing {
    const VERSION = '1.0.0';
    const OPT_API_KEY = 'te_account_pricing_pm_api_key';
    const OPT_PM_URL = 'te_account_pricing_pm_url';

    public static function boot() {
        add_action('admin_menu', [__CLASS__, 'admin_menu']);
        add_action('admin_init', [__CLASS__, 'register_settings']);
        add_action('admin_notices', [__CLASS__, 'admin_notice']);
        add_action('wp_enqueue_scripts', [__CLASS__, 'enqueue']);
        add_action('wp_ajax_te_account_pricing_proxy', [__CLASS__, 'ajax_proxy']);
        add_filter('http_request_args', [__CLASS__, 'inject_customer_context'], 25, 2);
        add_filter('http_request_args', [__CLASS__, 'capture_existing_pm_connection'], 5, 2);
        register_activation_hook(__FILE__, [__CLASS__, 'activate']);
    }

    public static function activate() {
        self::discover_existing_settings(true);
    }

    public static function register_settings() {
        register_setting('te_account_pricing', self::OPT_PM_URL, [
            'type' => 'string',
            'sanitize_callback' => [__CLASS__, 'sanitize_url'],
            'default' => 'https://production-manager-web.vercel.app',
        ]);
        register_setting('te_account_pricing', self::OPT_API_KEY, [
            'type' => 'string',
            'sanitize_callback' => [__CLASS__, 'sanitize_api_key'],
            'default' => '',
        ]);
    }

    public static function sanitize_url($value) {
        $url = untrailingslashit(esc_url_raw((string) $value));
        return $url ?: 'https://production-manager-web.vercel.app';
    }

    public static function sanitize_api_key($value) {
        $value = trim((string) $value);
        return preg_match('/^pm_[a-f0-9]{64}$/i', $value) ? $value : '';
    }

    public static function admin_menu() {
        add_options_page(
            'Tender Edge Account Pricing',
            'Tender Edge Account Pricing',
            'manage_options',
            'te-account-pricing',
            [__CLASS__, 'settings_page']
        );
    }

    public static function settings_page() {
        if (!current_user_can('manage_options')) return;
        self::discover_existing_settings(false);
        $url = self::pm_url();
        $key = self::api_key();
        ?>
        <div class="wrap">
            <h1>Tender Edge Account Pricing</h1>
            <p>This bridge keeps the existing Tender Edge website platform intact and adds logged-in MYOB Level A-F pricing.</p>
            <form method="post" action="options.php">
                <?php settings_fields('te_account_pricing'); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="te-account-pricing-url">Production Manager URL</label></th>
                        <td><input id="te-account-pricing-url" name="<?php echo esc_attr(self::OPT_PM_URL); ?>" type="url" class="regular-text" value="<?php echo esc_attr($url); ?>" /></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="te-account-pricing-key">Production Manager API key</label></th>
                        <td>
                            <input id="te-account-pricing-key" name="<?php echo esc_attr(self::OPT_API_KEY); ?>" type="password" autocomplete="off" class="regular-text" value="<?php echo esc_attr($key); ?>" />
                            <p class="description"><?php echo $key ? 'A Production Manager API key has been detected/configured.' : 'Paste the same pm_… API key already used by the Tender Edge website integration.'; ?></p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
            <p><strong>Logged-out visitors:</strong> public Level A pricing remains unchanged. <strong>Logged-in clients:</strong> PM resolves the account by PM client link, email, or company and uses that client’s MYOB price level.</p>
        </div>
        <?php
    }

    public static function admin_notice() {
        if (!current_user_can('manage_options')) return;
        if (self::api_key()) return;
        self::discover_existing_settings(false);
        if (self::api_key()) return;
        $url = admin_url('options-general.php?page=te-account-pricing');
        echo '<div class="notice notice-warning"><p><strong>Tender Edge Account Pricing:</strong> Production Manager API key was not auto-detected. <a href="' . esc_url($url) . '">Open Account Pricing settings</a> and paste the same PM API key used by the website platform.</p></div>';
    }

    private static function flatten_values($value, &$strings) {
        if (is_string($value)) {
            $strings[] = $value;
            $maybe = maybe_unserialize($value);
            if ($maybe !== $value) self::flatten_values($maybe, $strings);
            return;
        }
        if (is_array($value) || is_object($value)) {
            foreach ((array) $value as $item) self::flatten_values($item, $strings);
        }
    }

    private static function discover_existing_settings($force = false) {
        if (!$force && self::api_key()) return;
        global $wpdb;
        $rows = $wpdb->get_results(
            "SELECT option_value FROM {$wpdb->options} WHERE option_value LIKE '%pm\_%' OR option_value LIKE '%production-manager%' LIMIT 250",
            ARRAY_A
        );
        $strings = [];
        foreach ((array) $rows as $row) self::flatten_values($row['option_value'] ?? '', $strings);
        foreach ($strings as $candidate) {
            if (!self::api_key() && preg_match('/\b(pm_[a-f0-9]{64})\b/i', $candidate, $match)) {
                update_option(self::OPT_API_KEY, $match[1], false);
            }
            if (preg_match('#https?://[^\s\"\'<>]*production-manager[^\s\"\'<>]*#i', $candidate, $match)) {
                $detected = untrailingslashit(esc_url_raw($match[0]));
                if ($detected) update_option(self::OPT_PM_URL, $detected, false);
            }
        }
        if (!get_option(self::OPT_PM_URL)) update_option(self::OPT_PM_URL, 'https://production-manager-web.vercel.app', false);
    }

    private static function pm_url() {
        return self::sanitize_url(get_option(self::OPT_PM_URL, 'https://production-manager-web.vercel.app'));
    }

    private static function api_key() {
        return self::sanitize_api_key(get_option(self::OPT_API_KEY, ''));
    }

    private static function first_user_meta($user_id, $keys) {
        foreach ($keys as $key) {
            $value = trim((string) get_user_meta($user_id, $key, true));
            if ($value !== '') return $value;
        }
        return '';
    }

    private static function customer_context() {
        if (!is_user_logged_in()) return null;
        $user = wp_get_current_user();
        if (!$user || !$user->ID) return null;
        $pm_client_id = self::first_user_meta($user->ID, [
            '_te_pm_client_id', 'te_pm_client_id', '_pm_client_id', 'pm_client_id', 'production_manager_client_id'
        ]);
        $company = self::first_user_meta($user->ID, ['billing_company', 'company']);
        $email = self::first_user_meta($user->ID, ['billing_email']);
        if (!$email) $email = $user->user_email;
        return [
            'pmClientId' => $pm_client_id,
            'websiteUserId' => (string) $user->ID,
            'company' => $company,
            'firstName' => self::first_user_meta($user->ID, ['billing_first_name', 'first_name']),
            'lastName' => self::first_user_meta($user->ID, ['billing_last_name', 'last_name']),
            'email' => sanitize_email($email),
        ];
    }

    public static function enqueue() {
        if (!is_user_logged_in() || !function_exists('is_product') || !is_product()) return;
        self::discover_existing_settings(false);
        if (!self::api_key()) return;
        wp_enqueue_script(
            'te-account-pricing',
            plugins_url('assets/account-pricing.js', __FILE__),
            [],
            self::VERSION,
            true
        );
        wp_add_inline_script('te-account-pricing', 'window.TEAccountPricing=' . wp_json_encode([
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('te_account_pricing'),
            'enabled' => true,
        ]) . ';', 'before');
    }

    public static function ajax_proxy() {
        if (!is_user_logged_in()) wp_send_json(['error' => 'Login required for account pricing.'], 401);
        check_ajax_referer('te_account_pricing');
        self::discover_existing_settings(false);
        $api_key = self::api_key();
        if (!$api_key) wp_send_json(['error' => 'Production Manager account pricing is not configured.'], 503);

        $raw = isset($_POST['payload']) ? wp_unslash((string) $_POST['payload']) : '';
        $payload = json_decode($raw, true);
        if (!is_array($payload)) wp_send_json(['error' => 'Invalid pricing payload.'], 400);
        unset($payload['token']);
        $payload['customer'] = self::customer_context();

        $response = wp_remote_post(self::pm_url() . '/api/wordpress/price', [
            'timeout' => 25,
            'redirection' => 2,
            'headers' => [
                'Authorization' => 'Bearer ' . $api_key,
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
            ],
            'body' => wp_json_encode($payload),
        ]);
        if (is_wp_error($response)) wp_send_json(['error' => $response->get_error_message()], 502);
        $status = (int) wp_remote_retrieve_response_code($response);
        $body = (string) wp_remote_retrieve_body($response);
        $decoded = json_decode($body, true);
        if (!is_array($decoded)) $decoded = ['error' => 'Production Manager returned an invalid pricing response.'];
        wp_send_json($decoded, $status ?: 200);
    }

    public static function capture_existing_pm_connection($args, $url) {
        $url_string = (string) $url;
        if (stripos($url_string, 'production-manager') === false && stripos($url_string, '/api/wordpress/') === false) return $args;
        $headers = isset($args['headers']) && is_array($args['headers']) ? $args['headers'] : [];
        $authorization = '';
        foreach ($headers as $name => $value) {
            if (strtolower((string) $name) === 'authorization') $authorization = is_array($value) ? implode(' ', $value) : (string) $value;
        }
        if (preg_match('/Bearer\s+(pm_[a-f0-9]{64})/i', $authorization, $match) && !self::api_key()) {
            update_option(self::OPT_API_KEY, $match[1], false);
        }
        if (preg_match('#^https?://[^/]+#i', $url_string, $match) && stripos($url_string, '/api/wordpress/') !== false) {
            update_option(self::OPT_PM_URL, untrailingslashit(esc_url_raw($match[0])), false);
        }
        return $args;
    }

    public static function inject_customer_context($args, $url) {
        if (!is_user_logged_in()) return $args;
        if (stripos((string) $url, '/api/wordpress/price') === false) return $args;
        $body = $args['body'] ?? null;
        if (is_string($body)) {
            $decoded = json_decode($body, true);
            if (!is_array($decoded)) return $args;
            $decoded['customer'] = self::customer_context();
            $args['body'] = wp_json_encode($decoded);
            if (!isset($args['headers']) || !is_array($args['headers'])) $args['headers'] = [];
            $args['headers']['Content-Type'] = 'application/json';
        } elseif (is_array($body)) {
            $body['customer'] = self::customer_context();
            $args['body'] = $body;
        }
        return $args;
    }
}

TE_Account_Pricing::boot();
