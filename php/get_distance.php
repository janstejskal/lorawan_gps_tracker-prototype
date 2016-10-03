<?php
header("Content-type: text/html; charset=utf-8");

function mysqlConnect($SQLserver, $SQLdatabase, $SQLlogin, $SQLpassword)
{
    $dbc = mysqli_connect ($SQLserver, $SQLlogin, $SQLpassword) or die();
    mysqli_query($dbc, "SET NAMES utf8");
    mysqli_select_db($dbc, $SQLdatabase) or die();

    return $dbc;
}


$SQLserver = "";
$SQLdatabase = "lorawan";
$SQLlogin = "";
$SQLpassword = "";
$SQLprefix = "";

$dbc = mysqlConnect( $SQLserver, $SQLdatabase, $SQLlogin, $SQLpassword );

if (isset($_POST["gw_id"]) && isset($_POST["gw_ids"]) && isset($_POST["rssi"]) && isset($_POST["snr"]))
{
    $gw_id = mysqli_real_escape_string($dbc, $_POST["gw_id"]);
    $gw_ids = mysqli_real_escape_string($dbc, $_POST["gw_ids"]);
    $rssi = floatval($_POST["rssi"]);
    $snr = floatval($_POST["snr"]);

    $query = "SELECT distance FROM distance WHERE gw_id LIKE '".$gw_id."' AND gw_ids LIKE '".$gw_ids."' AND rssi = ".$rssi." AND snr=".$snr." LIMIT 1";
    $result = mysqli_query($dbc, $query);

    if ($d = mysqli_fetch_row($result))
    {
        echo json_encode(array("distance"=>$d[0]));
        exit();
    }
    else
    {
        echo json_encode(array("distance"=>null));
        exit();
    }
}
else
{
    echo json_encode(array("distance"=>null));
    exit();
}
?>