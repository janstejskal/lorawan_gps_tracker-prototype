<?php
header("Content-type: text/html; charset=utf-8");

$devices = array(
	"0018B20000000165",
	"0018B20000000336",
	"0018B2000000016E"
	);

$gw_list = json_decode('{
    "290000F6": {
        "lat": 50.043072,
        "lon": 14.55298,
        "des": "Nad Přehradou 406, Praha–Horní Měcholupy"
    },
    "29000049": {
        "lat": 50.120071,
        "lon": 14.501297
    },
    "08040024": {
        "lat": 50.101608,
        "lon": 14.343426
    },
    "290000F5": {
        "lat": 50.079823,
        "lon": 14.375796
    },
    "290000F2": {
        "lat": 50.08099,
        "lon": 14.451146
    },
    "290000F3": {
        "lat": 50.02718,
        "lon": 14.502614
    },
    "290000DC": {
        "lat": 50.057499,
        "lon": 14.473324
    },
    "2900000E": {
        "lat": 50.017231,
        "lon": 14.45028
    },
    "0804003C": {
        "lat": 50.080997,
        "lon": 14.451159
    },
    "29000036": {
        "lat": 50.099506,
        "lon": 14.416808
    },
    "290000A8": {
        "lat": 50.011356,
        "lon": 14.418019
    },
    "2900004D": {
        "lat": 50.0513,
        "lon": 14.355817
    },
    "290000E4": {
        "lat": 50.755474,
        "lon": 15.077041
    },
    "290000F7": {
        "lat": 50.763283,
        "lon": 15.053699
    },
    "29000034": {
        "lat": 50.227623,
        "lon": 14.587332
    },
    "2900004E": {
        "lat": 49.983814,
        "lon": 14.497198
    },
    "29000052": {
        "lat": 49.986191,
        "lon": 14.49245
    },
    "290000CC": {
        "lat": 50.077702,
        "lon": 14.498129
    },
    "080500F0": {
        "lat": 49.861053,
        "lon": 18.21447
    },
    "080500BA": {
        "lat": 49.832108,
        "lon": 18.168243
    },
    "2900004F": {
        "lat": 49.59063,
        "lon": 17.235708
    },
    "290000D1": {
        "lat": 49.590786,
        "lon": 17.277494
    },
    "290000A6": {
        "lat": 49.208405,
        "lon": 17.646503
    },
    "290000D5": {
        "lat": 50.039333,
        "lon": 15.767892
    },
    "29000050": {
        "lat": 50.214279,
        "lon": 15.813389
    },
    "290000D6": {
        "lat": 50.075691,
        "lon": 14.40769
    },
    "290000B9": {
        "lat": 49.215805,
        "lon": 16.634916
    },
    "290000D9": {
        "lat": 49.175968,
        "lon": 16.570541
    },
    "080500A9": {
        "lat": 49.198811,
        "lon": 16.579626
    }
}', true);

function get_data()
{
	global $devices;

	for ($i=0; $i<count($devices); $i++)
	{
		$curl = curl_init();
		curl_setopt_array($curl, array(
		    CURLOPT_RETURNTRANSFER => true,
		    CURLOPT_SSL_VERIFYPEER => false,
		    CURLOPT_URL => "https://api.pripoj.me/message/get/".$devices[$i]."?token=" // Summer Jam REST API token
		));
		$response = json_decode(curl_exec($curl), true);
		curl_close($curl);

		process_response($response);
	}
}

function process_response($response)
{
	global $gw_list;

    $records = array();
    for ($i=0; $i<count($response["records"]); $i++)
	{
		$gps = lorawan_payload_decode($response["records"][$i]["payloadHex"]);

        if ($gps !== null)
        {
            $gw_ids = array();
            for ($l=0; $l<count($response["records"][$i]["lrrs"]); $l++)
            {
                $gw_ids[] = $response["records"][$i]["lrrs"][$l]["Lrrid"];
            }

            for ($l=0; $l<count($response["records"][$i]["lrrs"]); $l++)
            {
                if (isset($gw_list[$response["records"][$i]["lrrs"][$l]["Lrrid"]]))
                {
                    $gw_id = $response["records"][$i]["lrrs"][$l]["Lrrid"];
                    $gw_lat = $gw_list[$response["records"][$i]["lrrs"][$l]["Lrrid"]]["lat"];
                    $gw_lon = $gw_list[$response["records"][$i]["lrrs"][$l]["Lrrid"]]["lon"];
                    $rssi = $response["records"][$i]["lrrs"][$l]["LrrRSSI"];
                    $snr = $response["records"][$i]["lrrs"][$l]["LrrSNR"];
                    $distance = get_distance($gw_lat, $gw_lon, $gps[0], $gps[1]);

                    $records[] = array(
                        "gw_id" => $gw_id,
                        "gw_ids" => $gw_ids,
                        "distance" => $distance,
                        "rssi" => $rssi,
                        "snr" => $snr
                    );
                }
            }
        }
	}

    if (count($records) > 0)
    {
        save($records);
    }
}

function hex_to_hexbytes($hex)
{
    $bytes = array();
    $hex = str_split($hex);
    for ($c = 0; $c < count($hex); $c += 2)
    {
        $value = hexdec(($hex[$c].$hex[$c+1]));
        $bytes[] = $value;
    }
    return $bytes;
}
function lorawan_payload_decode($payload)
{
    $payload_array = hex_to_hexbytes($payload);
    $is_gps = $payload_array[0] & 0x10;
    if ($is_gps)
    {
        $lat = (($payload_array[2] & 0xF0 ) >> 4)*10 + ($payload_array[2] & 0x0F);
        $lat += (((($payload_array[3] & 0xF0 ) >> 4)*10 + ($payload_array[3] & 0x0F) + ((($payload_array[4] & 0xF0) >> 4) / 10) + (($payload_array[4] & 0x0F) / 100 ) + (($payload_array[5] & 0xF0) >> 4) /1000)) /60;

        $lon = (($payload_array[6] & 0xF0 ) >> 4)*100 + ($payload_array[6] & 0x0F )*10 + (($payload_array[7] & 0xF0) >> 4);
        $lon += ((($payload_array[7] & 0x0F )* 10 + (($payload_array[8] & 0xF0) >> 4) + (($payload_array[8] & 0x0F) / 10) + (($payload_array[9] & 0xF0) >> 4) / 100)) /60;

        return array($lat, $lon);;
    }

    return null;
}

function get_distance($lat_1, $lon_1, $lat_2, $lon_2)
{
    $earth_r = 6371;
    $dLat = deg2rad($lat_2 - $lat_1);
    $dLon = deg2rad($lon_2 - $lon_1);
    $lat_1 = deg2rad($lat_1);
    $lat_2 = deg2rad($lat_2);

    $a = sin($dLat / 2) * sin($dLat / 2) + sin($dLon / 2) * sin($dLon / 2) * cos($lat_1) * cos($lat_2);
    $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
    $d = $earth_r * $c;

    return 1000 * $d;
}

function save($data)
{
    global $dbc;

    for ($i=0; $i<count($data); $i++)
    {
        $gw_id = mysqli_real_escape_string($dbc, $data[$i]["gw_id"]);
        $gw_ids = mysqli_real_escape_string($dbc, join(",", $data[$i]["gw_ids"]));
        $distance = floatval($data[$i]["distance"]);
        $rssi = floatval($data[$i]["rssi"]);
        $snr = floatval($data[$i]["snr"]);

        $query = "INSERT INTO distance (gw_id, gw_ids, distance, rssi, snr, `date`) VALUES ('".$gw_id."', '".$gw_ids."', ".$distance.", ".$rssi.", ".$snr.", NOW()) ON DUPLICATE KEY UPDATE gw_id = '".$gw_id."', gw_ids = '".$gw_ids."', distance = ".$distance.", rssi = ".$rssi.", snr = ".$snr.", `date` = NOW()";
        mysqli_query($dbc, $query);
    }
}

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

get_data();
?>