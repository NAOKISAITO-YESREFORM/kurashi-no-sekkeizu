<?php
/**
 * ============================================================
 * YES REFORM - 暮らしの設計図 URL暗号化スニペット
 * ============================================================
 * 
 * 【何をするコードか】
 *   Contact Form 7 の自動返信メール内で
 *   [YES_REFORM_SECURE_URL] というタグを書くと、
 *   お客様情報を暗号化した「暮らしの設計図」URLに自動置換します。
 * 
 * 【インストール手順】
 *   1. WordPress管理画面 → プラグイン → 新規追加
 *   2. 「Code Snippets」プラグインを検索してインストール&有効化
 *   3. Code Snippets → Add New
 *   4. タイトル: 「YES REFORM URL暗号化」
 *   5. コード欄にこのファイルの中身を貼り付け (この PHP コメント全部含めてOK)
 *   6. 「Run snippet everywhere」を選択
 *   7. Save Changes and Activate
 * 
 * 【Contact Form 7 側の設定】
 *   フォーム編集画面の「メール」タブ → 「メール (2)」のメール本文に、
 *   今まで書いていた URL の代わりに以下のように記入:
 * 
 *     [YES_REFORM_SECURE_URL]
 * 
 *   これだけ。送信時に自動で暗号化URLに置換されます。
 * 
 * 【セキュリティ】
 *   AES-256-CBC で暗号化されるため、URLからお名前・電話番号などが
 *   読み取れなくなります。サーバーログ・ブラウザ履歴・リファラへの
 *   情報流出を防ぎます。
 */

// ============================================================
// ★★★ 重要 ★★★
// この秘密キーは React 側 (App.jsx の URL_SECRET_KEY) と
// 必ず同じ値にしてください。
// 変更する場合は両方を一緒に変更すること。
// ============================================================
if (!defined('YES_REFORM_URL_SECRET')) {
    define('YES_REFORM_URL_SECRET', 'kurashi-yes-reform-2026-secure-v1');
}

/**
 * お客様情報を AES-256-CBC で暗号化し URL-safe base64 で返す
 */
function yes_reform_encrypt_url_data($data) {
    $json = json_encode($data, JSON_UNESCAPED_UNICODE);
    $key  = hash('sha256', YES_REFORM_URL_SECRET, true);
    $iv   = openssl_random_pseudo_bytes(16);
    $encrypted = openssl_encrypt($json, 'AES-256-CBC', $key, OPENSSL_RAW_DATA, $iv);
    // IV + 暗号文 を URL-safe base64
    return rtrim(strtr(base64_encode($iv . $encrypted), '+/', '-_'), '=');
}

/**
 * Contact Form 7 のメール送信前にフックして
 * [YES_REFORM_SECURE_URL] タグを暗号化URLに置換する
 */
add_filter('wpcf7_mail_components', 'yes_reform_inject_secure_url', 10, 3);
function yes_reform_inject_secure_url($components, $instance, $mail_instance) {
    // タグが本文にない場合は何もしない
    if (strpos($components['body'], '[YES_REFORM_SECURE_URL]') === false) {
        return $components;
    }
    
    // フォーム送信データを取得
    $submission = WPCF7_Submission::get_instance();
    if (!$submission) return $components;
    
    $posted = $submission->get_posted_data();
    
    // ============================================================
    // ★★★ ここを Contact Form 7 のフィールド名に合わせて修正 ★★★
    // ============================================================
    // 既存フォームのフィールド名(例: your-name, your-email など)を
    // 下記の右辺(angle brackets ['xxx'] の部分)に合わせて書き換え
    // フィールド名はCF7のフォーム編集画面で確認できます
    // ============================================================
    $data = array(
        'name'  => isset($posted['your-name'])  ? $posted['your-name']  : '',
        'email' => isset($posted['your-email']) ? $posted['your-email'] : '',
        'phone' => isset($posted['your-tel'])   ? $posted['your-tel']   : '',
    );
    
    // 暗号化トークンを生成
    $token = yes_reform_encrypt_url_data($data);
    
    // 暮らしの設計図のVercelドメイン
    $url = 'https://kurashi-no-sekkeizu.vercel.app/?d=' . urlencode($token);
    
    // メール本文中のタグを実URLに置換
    $components['body'] = str_replace('[YES_REFORM_SECURE_URL]', $url, $components['body']);
    
    return $components;
}
