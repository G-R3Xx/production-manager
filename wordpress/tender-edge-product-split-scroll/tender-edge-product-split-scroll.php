<?php
/**
 * Plugin Name: Tender Edge Product Split Scroll
 * Description: Desktop-only independent scrolling for the WooCommerce product gallery and Production Manager configurator columns.
 * Version: 1.0.4
 * Author: Tender Edge
 */

if (!defined('ABSPATH')) {
    exit;
}

final class Tender_Edge_Product_Split_Scroll {
    private const VERSION = '1.0.4';

    public static function boot(): void {
        add_action('wp_enqueue_scripts', [self::class, 'enqueue_assets'], 60);
    }

    public static function enqueue_assets(): void {
        if (!function_exists('is_product') || !is_product()) {
            return;
        }

        $base_url = plugin_dir_url(__FILE__);
        $base_path = plugin_dir_path(__FILE__);

        wp_enqueue_style(
            'tender-edge-product-split-scroll',
            $base_url . 'assets/product-split-scroll.css',
            [],
            self::asset_version($base_path . 'assets/product-split-scroll.css')
        );

        wp_enqueue_script(
            'tender-edge-product-split-scroll',
            $base_url . 'assets/product-split-scroll.js',
            [],
            self::asset_version($base_path . 'assets/product-split-scroll.js'),
            true
        );
    }

    private static function asset_version(string $path): string {
        $mtime = is_file($path) ? filemtime($path) : false;
        return $mtime ? self::VERSION . '.' . $mtime : self::VERSION;
    }
}

Tender_Edge_Product_Split_Scroll::boot();
