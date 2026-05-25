<?php

declare(strict_types=1);

namespace LRob\QRCodeMaker\Support;

/**
 * Content-type registry — the kinds of payload a QR code can encode.
 *
 * Each type has a label and a list of fields. The fields are rendered by the
 * JS layer (admin + frontend); composing them into the final encoded string
 * (vCard, MECARD, WIFI URI, mailto:, sms:, tel:) also happens client-side so
 * preview and export stay aligned without a server round-trip.
 *
 * Server side only needs to localise the strings — there is no PHP composer,
 * since the same encoded string travels with the QR through the rest of the
 * pipeline (saved as `target_url`, used as the tracking redirect target when
 * tracking is off, etc.).
 */
final class ContentTypes
{
    /**
     * @return array<string, array{label:string, fields:array<int, array{name:string,label:string,type?:string,placeholder?:string,options?:array<int,array{0:string,1:string}>}>}>
     */
    public static function definitions(): array
    {
        return [
            'url' => [
                'label'  => __('URL', 'lrob-qrcode-maker'),
                'fields' => [
                    [
                        'name'        => 'url',
                        'label'       => __('URL', 'lrob-qrcode-maker'),
                        'type'        => 'text',
                        'placeholder' => 'https://example.com',
                    ],
                ],
            ],
            'text' => [
                'label'  => __('Plain text', 'lrob-qrcode-maker'),
                'fields' => [
                    [
                        'name'        => 'text',
                        'label'       => __('Text', 'lrob-qrcode-maker'),
                        'type'        => 'textarea',
                        'placeholder' => '',
                    ],
                ],
            ],
            'vcard' => [
                'label'  => __('Contact (vCard)', 'lrob-qrcode-maker'),
                'fields' => [
                    ['name' => 'firstName', 'label' => __('First name', 'lrob-qrcode-maker')],
                    ['name' => 'lastName',  'label' => __('Last name', 'lrob-qrcode-maker')],
                    ['name' => 'org',       'label' => __('Organization', 'lrob-qrcode-maker')],
                    ['name' => 'title',     'label' => __('Job title', 'lrob-qrcode-maker')],
                    ['name' => 'email',     'label' => __('Email', 'lrob-qrcode-maker'), 'type' => 'email'],
                    ['name' => 'phone',     'label' => __('Phone', 'lrob-qrcode-maker'), 'type' => 'tel'],
                    ['name' => 'url',       'label' => __('Website', 'lrob-qrcode-maker')],
                    ['name' => 'address',   'label' => __('Address', 'lrob-qrcode-maker'), 'type' => 'textarea'],
                ],
            ],
            'wifi' => [
                'label'  => __('Wi-Fi network', 'lrob-qrcode-maker'),
                'fields' => [
                    ['name' => 'ssid',     'label' => __('Network name (SSID)', 'lrob-qrcode-maker')],
                    ['name' => 'password', 'label' => __('Password', 'lrob-qrcode-maker')],
                    [
                        'name'    => 'encryption',
                        'label'   => __('Encryption', 'lrob-qrcode-maker'),
                        'type'    => 'select',
                        'options' => [
                            ['WPA',    __('WPA / WPA2', 'lrob-qrcode-maker')],
                            ['WEP',    __('WEP', 'lrob-qrcode-maker')],
                            ['nopass', __('None (open)', 'lrob-qrcode-maker')],
                        ],
                    ],
                    [
                        'name'  => 'hidden',
                        'label' => __('Hidden network', 'lrob-qrcode-maker'),
                        'type'  => 'checkbox',
                    ],
                ],
            ],
            'email' => [
                'label'  => __('Email', 'lrob-qrcode-maker'),
                'fields' => [
                    ['name' => 'to',      'label' => __('Recipient', 'lrob-qrcode-maker'), 'type' => 'email'],
                    ['name' => 'subject', 'label' => __('Subject', 'lrob-qrcode-maker')],
                    ['name' => 'body',    'label' => __('Body', 'lrob-qrcode-maker'),       'type' => 'textarea'],
                ],
            ],
            'sms' => [
                'label'  => __('SMS', 'lrob-qrcode-maker'),
                'fields' => [
                    ['name' => 'phone',   'label' => __('Phone number', 'lrob-qrcode-maker'), 'type' => 'tel'],
                    ['name' => 'message', 'label' => __('Message', 'lrob-qrcode-maker'),      'type' => 'textarea'],
                ],
            ],
            'tel' => [
                'label'  => __('Phone call', 'lrob-qrcode-maker'),
                'fields' => [
                    ['name' => 'phone', 'label' => __('Phone number', 'lrob-qrcode-maker'), 'type' => 'tel'],
                ],
            ],
            'geo' => [
                'label'  => __('Geolocation', 'lrob-qrcode-maker'),
                'fields' => [
                    ['name' => 'lat', 'label' => __('Latitude', 'lrob-qrcode-maker'),  'placeholder' => '48.8566'],
                    ['name' => 'lng', 'label' => __('Longitude', 'lrob-qrcode-maker'), 'placeholder' => '2.3522'],
                ],
            ],
        ];
    }
}
