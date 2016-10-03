<?php
header("Content-type: text/html; charset=utf-8");

function get_data($device, $token)
{
    $curl = curl_init();
    curl_setopt_array($curl, array(
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_URL => "https://api.pripoj.me/message/get/".$device."?token=".$token
    ));
    $response = curl_exec($curl);
    curl_close($curl);

    return $response;
}

if (isset($_GET["token"]) && isset($_GET["devEUI"]))
{
    $device = $_GET["devEUI"];
    $token = $_GET["token"];

    echo get_data($device, $token);
}

exit();
?>