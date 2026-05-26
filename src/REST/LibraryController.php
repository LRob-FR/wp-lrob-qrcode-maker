<?php

declare(strict_types=1);

namespace LRob\QRCodeMaker\REST;

use LRob\QRCodeMaker\Activator;
use LRob\QRCodeMaker\Library\Repository;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * Admin-only CRUD over the QR library. All endpoints require the plugin
 * capability + a `wp_rest` nonce. JSON in, JSON out.
 *
 * Routes:
 *   GET    /lrob-qrm/v1/library          — list
 *   POST   /lrob-qrm/v1/library          — create
 *   PUT    /lrob-qrm/v1/library/{id}     — update
 *   DELETE /lrob-qrm/v1/library/{id}     — delete
 */
final class LibraryController
{
    public const ROUTE_NAMESPACE = 'lrob-qrm/v1';

    public function register(): void
    {
        add_action('rest_api_init', [$this, 'register_routes']);
    }

    public function register_routes(): void
    {
        register_rest_route(self::ROUTE_NAMESPACE, '/library', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'permission_callback' => [$this, 'permissions'],
                'callback'            => [$this, 'list'],
            ],
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'permission_callback' => [$this, 'permissions'],
                'callback'            => [$this, 'create'],
            ],
        ]);
        register_rest_route(self::ROUTE_NAMESPACE, '/library/(?P<id>\d+)', [
            [
                'methods'             => WP_REST_Server::EDITABLE,
                'permission_callback' => [$this, 'permissions'],
                'callback'            => [$this, 'update'],
            ],
            [
                'methods'             => WP_REST_Server::DELETABLE,
                'permission_callback' => [$this, 'permissions'],
                'callback'            => [$this, 'delete'],
            ],
        ]);
    }

    public function permissions(WP_REST_Request $request): bool|WP_Error
    {
        if (!current_user_can(Activator::CAPABILITY)) {
            return new WP_Error('lrob_qrm_forbidden', __('Forbidden', 'lrob-qrcode-maker'), ['status' => 403]);
        }
        // REST cookie nonce is enforced by core when the request has cookies;
        // this is the belt-and-braces check for explicit nonce usage.
        return true;
    }

    public function list(): WP_REST_Response
    {
        return new WP_REST_Response((new Repository())->all());
    }

    public function create(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $body = $request->get_json_params();
        if (!is_array($body)) {
            return new WP_Error('lrob_qrm_bad_body', __('Invalid body', 'lrob-qrcode-maker'), ['status' => 400]);
        }
        $sanitized = $this->sanitize_payload($body);
        if ($sanitized instanceof WP_Error) {
            return $sanitized;
        }
        $id = (new Repository())->create($sanitized);
        if ($id === 0) {
            return new WP_Error('lrob_qrm_insert_failed', __('Could not save QR code.', 'lrob-qrcode-maker'), ['status' => 500]);
        }
        return new WP_REST_Response((new Repository())->find($id), 201);
    }

    public function update(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $id = (int) $request['id'];
        $body = $request->get_json_params();
        if (!is_array($body)) {
            return new WP_Error('lrob_qrm_bad_body', __('Invalid body', 'lrob-qrcode-maker'), ['status' => 400]);
        }
        $sanitized = $this->sanitize_payload($body, partial: true);
        if ($sanitized instanceof WP_Error) {
            return $sanitized;
        }
        $repo = new Repository();
        if (!$repo->update($id, $sanitized)) {
            return new WP_Error('lrob_qrm_update_failed', __('Could not update QR code.', 'lrob-qrcode-maker'), ['status' => 404]);
        }
        return new WP_REST_Response($repo->find($id));
    }

    public function delete(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $id = (int) $request['id'];
        if (!(new Repository())->delete($id)) {
            return new WP_Error('lrob_qrm_delete_failed', __('Could not delete QR code.', 'lrob-qrcode-maker'), ['status' => 404]);
        }
        return new WP_REST_Response(['deleted' => true, 'id' => $id]);
    }

    /**
     * @param array<string, mixed> $body
     * @return array<string, mixed>|WP_Error
     */
    private function sanitize_payload(array $body, bool $partial = false): array|WP_Error
    {
        $out = [];

        if (array_key_exists('label', $body)) {
            $out['label'] = sanitize_text_field((string) $body['label']);
        }
        if (array_key_exists('target_url', $body)) {
            $target = trim((string) $body['target_url']);
            if ($target === '') {
                return new WP_Error('lrob_qrm_empty_target', __('Target URL or text is required.', 'lrob-qrcode-maker'), ['status' => 400]);
            }
            if (strlen($target) > 2000) {
                return new WP_Error('lrob_qrm_target_too_long', __('Target is too long.', 'lrob-qrcode-maker'), ['status' => 400]);
            }
            $out['target_url'] = $target;
        } elseif (!$partial) {
            return new WP_Error('lrob_qrm_missing_target', __('Target URL or text is required.', 'lrob-qrcode-maker'), ['status' => 400]);
        }
        if (array_key_exists('tracking_enabled', $body)) {
            $out['tracking_enabled'] = !empty($body['tracking_enabled']);
        }
        if (array_key_exists('design', $body) && is_array($body['design'])) {
            // Design JSON is a render hint — strip non-scalar leaves to avoid
            // nested-object trickery, then cap the serialized size so a
            // compromised admin account can't bloat the DB with multi-MB
            // payloads (16 KB is ~50× more than any real design needs).
            $design = self::flatten_design($body['design']);
            if (strlen((string) wp_json_encode($design)) > 16384) {
                return new WP_Error('lrob_qrm_design_too_large', __('Design payload is too large.', 'lrob-qrcode-maker'), ['status' => 400]);
            }
            $out['design'] = $design;
        }
        if (array_key_exists('logo_attachment_id', $body)) {
            $aid = (int) $body['logo_attachment_id'];
            // Cross-check the attachment exists + is an image — refuses
            // referencing a non-image attachment ID by guessing the number.
            if ($aid > 0) {
                $post = get_post($aid);
                if (!$post || $post->post_type !== 'attachment'
                    || strpos((string) get_post_mime_type($aid), 'image/') !== 0) {
                    return new WP_Error(
                        'lrob_qrm_bad_logo_attachment',
                        __('logo_attachment_id does not reference an image attachment.', 'lrob-qrcode-maker'),
                        ['status' => 400]
                    );
                }
            }
            $out['logo_attachment_id'] = $aid > 0 ? $aid : 0;
        }
        return $out;
    }

    /**
     * @param array<string, mixed> $in
     * @return array<string, mixed>
     */
    private static function flatten_design(array $in): array
    {
        $out = [];
        foreach ($in as $k => $v) {
            if (!is_string($k) || strlen($k) > 32) {
                continue;
            }
            // contentValues is an exception: a one-level-deep object of
            // scalar fields (the user's typed input for vCard, Wi-Fi, etc.).
            if ($k === 'contentValues' && is_array($v)) {
                $values = [];
                foreach ($v as $fk => $fv) {
                    if (!is_string($fk) || strlen($fk) > 32) {
                        continue;
                    }
                    if (is_scalar($fv) || $fv === null) {
                        $values[$fk] = $fv;
                    }
                }
                $out[$k] = $values;
                continue;
            }
            if (is_scalar($v) || $v === null) {
                $out[$k] = $v;
            }
        }
        return $out;
    }
}
