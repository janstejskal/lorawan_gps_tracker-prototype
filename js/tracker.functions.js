/*
 * LoRaWAN GPS tracker - prototyp
 * ------------------------------
 * Prototyp aplikace k lokalizaci za pomocí sítě LoRaWAN
 * Poloha může být vypočtena trilaterací nebo několikanásobnou bilaterací, případně odhadnuta pomocí bilaterace nebo určena pomocí GPS
 *
 * Soutěžní projekt Czech IoT Summer Jam
 *
 * Autor: Jan Stejskal
 * http://jan-stejskal.cz
 * info@jan-stejskal.cz
 *
 */

// ziskat data z cloudu pomocí Summer Jam REST API
// a parsovat pro získání seznamu gateway, rssi, snr, payload a data
function get_data(devEUI)
{
    function parse_data(json)
    {
        if ((typeof json._meta.status != "undefined") && (json._meta.status == "SUCCESS"))
        {
            if ((typeof json._meta.count != "undefined") && (json._meta.count > 0))
            {
                var records = [];
                for (var i=0; i<json.records.length; i++)
                {
                    records.push({
                        "payload": json.records[i].payloadHex,
                        "date": json.records[i].createdAt,
                        "gws": json.records[i].lrrs.length,
                        "lrrid": json.records[i].lrrid,
                        "lrrs": json.records[i].lrrs
                    });
                }
                return records;
            }
            else
            {
                console.log("Nejsou data");
                return null;
            }
        }
        else if ((typeof json._meta.status != "undefined") && (json._meta.status == "ERROR"))
        {
            if (typeof json.records.applicationCode != "undefined")
            {
                switch (json.records.applicationCode)
                {
                    case "T1000":
                        console.log("Neautorizovaný požadavek – chybějící nebo neplatný parametr token");
                        break;
                    case "N1000":
                        console.log("Neexistující / neplatná URL");
                        break;
                    case "F1001":
                        console.log("Chybná hodnota parametru order – musí být „asc“ nebo „desc“");
                        break;
                    case "F1002":
                        console.log("Chybná hodnota parametru start – musí být ve formátu 2016-01-01T01:50:50");
                        break;
                    case "F1003":
                        console.log("Chybná hodnota parametru stop – musí být ve formátu 2016-01-01T01:50:50");
                        break;
                    default:
                        console.log("Chyba: " + json.records.userMessage);
                        break;
                }
            }
            return null;
        }
        else
        {
            console.log("Data nelze zpracovat");
            return null;
        }
    }

    //$.getJSON("https://api.pripoj.me/message/get/" + devEUI + "?token=" + TOKEN, function(json){
    $.getJSON("http://lorawan.zobrazit.info/get_data.php?token=" + TOKEN + "&devEUI=" + devEUI, function(json){
        process_data(parse_data(json));
    })
    .fail(function(jqxhr, textStatus, error){
        if (jqxhr.responseJSON)
        {
            parse_data(jqxhr.responseJSON);
        }
        else
        {
            console.log(error);
        }
    });
}

// zpracovat získaná data
// pokusit se vypočítat polohu trilaterací, získat GPS polohu z payload
function process_data(data)
{
    var pos, pos1, pos2 = null;
    var calculated = false;
    var circles = [];

    var gw_ids = get_gws(data[0].lrrs);
    var gps = lorawan_payload_decode(data[0].payload);

    if (get_distance_data())
    {
        if (parseInt(data[0].gws) > 2)
        {
            var point = [];
            for (var i=0; i<data[0].gws; i++)
            {
                var gw_pos = polar_to_cartesian(gw_list[data[0].lrrs[i].Lrrid].lat, gw_list[data[0].lrrs[i].Lrrid].lon);
                //var r = rssi_to_distance(data[0].lrrs[i].LrrRSSI);
                var gw_id = data[0].lrrs[i].Lrrid;
                var rssi = data[0].lrrs[i].LrrRSSI;
                var snr = data[0].lrrs[i].LrrSNR;
                var r = get_distance(gw_id, gw_ids, rssi, snr);

                point.push({"x": gw_pos.x, "y": gw_pos.y, "z": gw_pos.z, "r": r});
                circles.push({"lat": gw_list[data[0].lrrs[i].Lrrid].lat, "lon": gw_list[data[0].lrrs[i].Lrrid].lon, "r": r});
            }

            var p = trilaterate(point[0], point[1], point[2]);

            if (p !== null)
            {
                if (p.length > 1)
                {
                    pos1 = cartesian_to_polar(p[0].x, p[0].y, p[0].z);
                    pos2 = cartesian_to_polar(p[1].x, p[1].y, p[1].z);
                }
                else
                {
                    pos1 = cartesian_to_polar(p[0].x, p[0].y, p[0].z);
                }
                calculated = true;
            }
            else
            {
                pos1 = gps;
            }
        }
        else
        {
            for (var i=0; i<data[0].gws; i++)
            {
                //var r = rssi_to_distance(data[0].lrrs[i].LrrRSSI);
                var gw_id = data[0].lrrs[i].Lrrid;
                var rssi = data[0].lrrs[i].LrrRSSI;
                var snr = data[0].lrrs[i].LrrSNR;
                var r = get_distance(gw_id, gw_ids, rssi, snr);
                circles.push({"lat": gw_list[data[0].lrrs[i].Lrrid].lat, "lon": gw_list[data[0].lrrs[i].Lrrid].lon, "r": r});
            }

            pos1 = gps;
        }

        if ((pos1 != null) && (pos2 != null))
        {
            pos = [pos1, pos2];
        }
        else if (pos1 != null)
        {
            pos = [pos1];
        }
        else
        {
            pos = null;
        }
        show_position(pos, calculated, circles, data[0].date, gps);
    }
}

// dekodovat payload ze zařízení Adeunis RF Demonstrator (ARF8084BA)
function lorawan_payload_decode(payload)
{
    function hex_to_hexbytes(hex)
    {
        for (var bytes = [], c = 0; c < hex.length; c += 2)
        {
            bytes.push("0x" + hex.substr(c, 2));
        }
        return bytes;
    }

    var payload_array = hex_to_hexbytes(payload);
    var is_gps = payload_array[0] & 0x10;
    if (is_gps)
    {
        var lat = ((payload_array[2] & 0xF0 ) >> 4)*10 + (payload_array[2] & 0x0F);
        lat += ((((payload_array[3] & 0xF0 ) >> 4)*10 + (payload_array[3] & 0x0F) + (((payload_array[4] & 0xF0) >> 4) / 10) + ((payload_array[4] & 0x0F) / 100 ) + ((payload_array[5] & 0xF0) >> 4) /1000)) /60;

        var lon = ((payload_array[6] & 0xF0 ) >> 4)*100 + (payload_array[6] & 0x0F )*10 + ((payload_array[7] & 0xF0) >> 4);
        lon += (((payload_array[7] & 0x0F )* 10 + ((payload_array[8] & 0xF0) >> 4) + ((payload_array[8] & 0x0F) / 10) + ((payload_array[9] & 0xF0) >> 4) / 100)) /60;

        return {"lat": lat.toFixed(6), "lon": lon.toFixed(6)};
    }

    return null;
}

// převod GPS souřadnic na kartézké
function polar_to_cartesian(lat, lon)
{
    function rad(a)
    {
        return a * (Math.PI / 180);
    }

    var earth_r = 6371;
    return {"x": earth_r * (Math.cos(rad(lon)) * Math.cos(rad(lat))), "y": earth_r * (Math.sin(rad(lon)) * Math.cos(rad(lat))), "z": earth_r * (Math.sin(rad(lat)))};
}

// převod souřadnic z kartézkého systému na GPS
function cartesian_to_polar(x, y, z)
{
    function deg(a)
    {
        return a * (180 / Math.PI);
    }

    var earth_r = 6371;
    return {"lat": deg(Math.asin(z / earth_r)).toFixed(6), "lon": deg(Math.atan2(y, x)).toFixed(6)};
}

// bilaterace
// vypočte polohu průsečíků kružnic
function bilaterate(p1, p2)
{
    var lat_lng_1 = new google.maps.LatLng(p1.lat, p1.lon);
    var lat_lng_2 = new google.maps.LatLng(p2.lat, p2.lon);

    if (lat_lng_1.equals(lat_lng_2))
    {
        return null;
    }

    var d = google.maps.geometry.spherical.computeDistanceBetween(lat_lng_1, lat_lng_2);

    if(d > (p1.r + p2.r))
    {
        return null;
    }

    var h = google.maps.geometry.spherical.computeHeading(lat_lng_1, lat_lng_2);
    var m = (Math.pow(p1.r, 2) - Math.pow(p2.r, 2) + Math.pow(d, 2)) / (2*d);

    var _h = Math.acos(m / p1.r) * 180 / Math.PI;

    return [
        google.maps.geometry.spherical.computeOffset(lat_lng_1, p1.r, h + _h),
        google.maps.geometry.spherical.computeOffset(lat_lng_1, p1.r, h - _h)
    ];
}

// vypočte pravděpodobnou polohu porovnáním vzdáleností mezi průsečíky
// nejkratší vzdálenost z vybraného bodu k ostatním bodům se považuje za nejpravděpodobnější
function calculate_position(points)
{
    function get_index_of_smallest(a)
    {
        return a.indexOf(Math.min.apply(Math, a));
    }

    var d;
    var ad = [];

    for (var p=0; p<points.length; p++)
    {
        ad[p] = [];
        for (var q=0; q<points.length; q++)
        {
            if (p != q)
            {
                d = google.maps.geometry.spherical.computeDistanceBetween(points[p], points[q]);
                ad[p].push(d);
            }
        }
    }

    var s = [];
    for (var a=0; a<ad.length; a++)
    {
        ad[a].sort(function(a,b) { return a - b;});
        s.push(ad[a][0] + ad[a][1]);
    }
    var point = get_index_of_smallest(s);

    return points[point];
}

// trilaterace
// vypočte souřadnice z tří kružnic protínajících se v jednom společném bodě
function trilaterate(p1, p2, p3)
{
    function norm(a)
    {
        return Math.sqrt(Math.pow(a.x, 2) + Math.pow(a.y, 2) + Math.pow(a.z, 2));
    }
    function dot(a, b)
    {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }
    function vector_subtract(a, b)
    {
        return {"x": a.x - b.x, "y": a.y - b.y, "z": a.z - b.z};
    }
    function vector_add(a, b)
    {
        return {"x": a.x + b.x, "y": a.y + b.y, "z": a.z + b.z};
    }
    function vector_divide(a, b)
    {
        return {"x": a.x / b, "y": a.y / b, "z": a.z / b};
    }
    function vector_multiply(a, b)
    {
        return {"x": a.x * b, "y": a.y * b, "z": a.z * b};
    }
    function vector_cross(a, b)
    {
        return {"x": a.y * b.z - a.z * b.y, "y": a.z * b.x - a.x * b.z, "z": a.x * b.y - a.y * b.x};
    }

    var ex, ey, ez, i, j, d, a, x, y, z, b, p4a, p4b;

    ex = vector_divide(vector_subtract(p2, p1), norm(vector_subtract(p2, p1)));

    i = dot(ex, vector_subtract(p3, p1));
    a = vector_subtract(vector_subtract(p3, p1), vector_multiply(ex, i));
    ey = vector_divide(a, norm(a));
    ez = vector_cross(ex, ey);
    d = norm(vector_subtract(p2, p1));
    j = dot(ey, vector_subtract(p3, p1));

    x = (Math.pow(p1.r, 2) - Math.pow(p2.r, 2) + Math.pow(d, 2)) / (2 * d);
    y = (Math.pow(p1.r, 2) - Math.pow(p3.r, 2) + Math.pow(i, 2) + Math.pow(j, 2)) / (2 * j) - (i / j) * x;

    b = Math.pow(p1.r, 2) - Math.pow(x, 2) - Math.pow(y, 2);

    if (Math.abs(b) < 0.0000000001)
    {
        b = 0;
    }

    z = Math.sqrt(b);

    if (isNaN(z))
    {
        return null;
    }

    //a = vector_add(p1, vector_add(vector_multiply(ex, x), vector_add(vector_multiply(ey, y), vector_multiply(ez, z))));
    a = vector_add(p1, vector_add(vector_multiply(ex, x), vector_multiply(ey, y)));
    p4a = vector_add(a, vector_multiply(ez, z));
    p4b = vector_subtract(a, vector_multiply(ez, z));

    if (z == 0)
    {
        return [a];
    }
    else
    {
        return [p4a, p4b];
    }
}

// získat vzdálenost z rssi, použitelné pouze ve volném prostranství
function rssi_to_distance(rssi)
{
    var ratio = rssi * 1.0 / TX_POWER;
    if (ratio < 1.0)
    {
        return Math.pow(ratio, 10);
    }
    else
    {
        return ((0.89976) * Math.pow(ratio, 7.7095) + 0.111);
    }
}

// získat vzdálenost zařízení od gateway z GPS souřadnic
// volání naplní databázi aktuálními údaji
// slouží ke sběru dat
function get_distance_data()
{
    $.ajax({
        url: "http://lorawan.zobrazit.info/index.php",
        method: "GET",
        async: false
    })
    .done(function(data, textStatus, jqXHR){

    });

    return true;
}

// získat vzdálenost od gateway z databáze
function get_distance(gw_id, gw_ids, rssi, snr)
{
    var ret = null;

    $.ajax({
        url: "http://lorawan.zobrazit.info/get_distance.php",
        data: {gw_id: gw_id, gw_ids: gw_ids, rssi: rssi, snr: snr},
        method: "POST",
        async: false
    })
    .done(function(data, textStatus, jqXHR){
        if (data != "")
        {
            var d = JSON.parse(data);
            if (d.distance != null)
            {
                ret =  parseFloat(d.distance);
            }
            else
            {
                console.error("Get distance failed.");
            }
        }
        else
        {
            console.error("Get distance failed.");
        }
    })
    .fail(function(jqXHR, textStatus, errorThrown){
        console.error("Get distance failed.");
    });

    return ret;
}

// získat seznam gateway jako řetězec
function get_gws(data)
{
    var ids = [];
    for (var i=0; i<data.length; i++)
    {
        ids.push(data[i].Lrrid);
    }

    return ids.join(",");
}

// předřadit zadaný počet nul řetězci
String.prototype.padLeft = function(pad)
{
    return String("00000000000000000000000000000000" + this).slice(-pad);;
}

// vykreslit polohu a vzdálenosti od gw v mapě
// vypočítat polohu pomocí bilaterace
function show_position(pos, calculated, circles, date, gps)
{
    console.log(pos, calculated, circles, date, gps);

    var position_gps = false;
    var position_trilaterate = false;
    var position_calculated = false;
    var position = null;

    // formatovat datum a čas
    var _datetime = new Date(date);
    var datetime = _datetime.getDate() + ". " + (_datetime.getMonth() + 1) + ". " + _datetime.getFullYear() + " " + _datetime.getHours().toString().padLeft(2) + ":" + _datetime.getMinutes().toString().padLeft(2) + ":" + _datetime.getSeconds().toString().padLeft(2);

    // definice zobrazení bodů v mapě
    var ico_gps = {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillOpacity: 0.75,
        strokeWeight: 2,
        animation: google.maps.Animation.DROP,
        strokeColor: '#FF6100',
        fillColor: '#FF6100'
    };
    var ico_trilaterate = {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillOpacity: 0.75,
        strokeWeight: 2,
        animation: google.maps.Animation.DROP,
        strokeColor: '#B200FF',
        fillColor: '#B200FF'
    };
    var ico_intersection = {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 4,
        fillOpacity: 0.25,
        strokeOpacity: 0.25,
        strokeWeight: 1,
        animation: google.maps.Animation.DROP,
        strokeColor: '#00AEFF',
        fillColor: '#00AEFF'
    };
    var ico_probable = {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillOpacity: 0.75,
        strokeWeight: 2,
        animation: google.maps.Animation.DROP,
        strokeColor: '#90FF00',
        fillColor: '#90FF00'
    };

    // vykreslit všechny kružnice ve vypočtené vzdálenosti od gw
    if (circles.length > 0)
    {
        for (var c = 0; c < circles.length; c++)
        {
            if (circles[c].r == null)
            {
                circles[c].r = 0;
            }
            var circle = new google.maps.Circle({
                center: {"lat": circles[c].lat, "lng": circles[c].lon},
                radius: circles[c].r,
                strokeColor: '#2ABCE0',
                strokeOpacity: 0.25,
                strokeWeight: 2,
                fillColor: '#85E0F7',
                fillOpacity: 0.15
            });

            circle.setMap(map);
        }
    }

    // vypočítat všechny průsečíky kružnic
    var points = [];
    if (circles.length == 2)
    {
        var _p = bilaterate(circles[0], circles[1]);
        if (_p != null)
        {
            points.push(_p[0], _p[1]);
        }
    }
    else if (circles.length == 3)
    {
        var _p = bilaterate(circles[0], circles[1]);
        if (_p != null)
        {
            points.push(_p[0], _p[1]);
        }

        _p = bilaterate(circles[0], circles[2]);
        if (_p != null)
        {
            points.push(_p[0], _p[1]);
        }

        _p = bilaterate(circles[1], circles[2]);
        if (_p != null)
        {
            points.push(_p[0], _p[1]);
        }
    }

    // vykreslit průsečíky kružnic
    for (var p = 0; p < points.length; p++)
    {
        var point = new google.maps.Marker({
            icon: ico_intersection,
            position: {"lat": points[p].lat(), "lng": points[p].lng()}
        });

        point.setMap(map);
    }

    // nastavit přiblížení mapy
    map.setZoom(16);

    // vykreslit polohu v mapě
    if ((pos !== null) && (pos.length > 0))
    {
        if (gps != null)
        {
            // GPS poloha
            var point = new google.maps.Marker({
                icon: ico_gps,
                position: {"lat": parseFloat(gps.lat), "lng": parseFloat(gps.lon)}
            });

            point.setMap(map);

            position = {"lat": parseFloat(gps.lat), "lon": parseFloat(gps.lon)};
            map.panTo({"lat": parseFloat(gps.lat), "lng": parseFloat(gps.lon)});
            position_gps = true;
        }

        if (calculated)
        {
            for (var i=0; i<pos.length; i++)
            {
                // poloha vypočtená trilaterací
                var point = new google.maps.Marker({
                    icon: ico_trilaterate,
                    position: {"lat": parseFloat(pos[i].lat), "lng": parseFloat(pos[i].lon)}
                });

                point.setMap(map);

                if (pos.length > 1)
                {
                    position = [{"lat": parseFloat(pos[0].lat), "lon": parseFloat(pos[0].lon)}, {"lat": parseFloat(pos[1].lat), "lon": parseFloat(pos[1].lon)}];
                }
                else
                {
                    position = {"lat": parseFloat(pos[0].lat), "lon": parseFloat(pos[0].lon)};
                    map.panTo({"lat": parseFloat(pos[0].lat), "lng": parseFloat(pos[0].lon)});
                }
                position_trilaterate = true;
            }
        }
    }

    if (circles.length > 1)
    {
        if (points.length > 0)
        {
            if (circles.length == 3)
            {
                // vypočítat polohu násobnou bilaterací
                var calc_pos = calculate_position(points);

                var point = new google.maps.Marker({
                    icon: ico_probable,
                    position: {"lat": calc_pos.lat(), "lng": calc_pos.lng()}
                });

                point.setMap(map);

                position = {"lat": calc_pos.lat(), "lon": calc_pos.lng()};
                if ((!position_gps) && (!position_trilaterate))
                {
                    map.panTo({"lat": calc_pos.lat(), "lng": calc_pos.lng()});
                }
            }
            else
            {
                // pravděpodobné polohy
                position = [{"lat": points[0].lat(), "lon": points[0].lng()}, {"lat": points[1].lat(), "lon": points[1].lng()}];
                var m = google.maps.geometry.spherical.interpolate(points[0], points[1], 0.5);
                if ((!position_gps) && (!position_trilaterate))
                {
                    map.setZoom(14);
                    map.panTo({"lat": m.lat(), "lng": m.lng()});
                }
            }

            position_calculated = true;
        }
    }
    else
    {
        if ((!position_gps) && (!position_trilaterate))
        {
            map.setZoom(14);
            map.panTo({"lat": circles[0].lat, "lng": circles[0].lon});
        }
    }

    // zobrazit informace o poloze a další údaje
    var log = "";
    log += "Lokátor: " + dev_eui + "<br>";
    log += "Datum a čas posledních získaných dat: " + datetime + "<br>";

    if (position_gps || position_trilaterate || position_calculated)
    {
        log += "Poloha získána metodou: ";
        if (position_trilaterate)
        {
            log += "Trilaterace" + "<br>";
        }
        else if (position_calculated)
        {
            if (circles.length > 2)
            {
                log += "Několikanásobná bilaterace" + "<br>";
            }
            else
            {
                log += "Bilaterace" + "<br>";
            }
        }
        else if (position_gps)
        {
            log += "GPS" + "<br>";
        }

        if (position != null)
        {
            if (Array.isArray(position))
            {
                log += "Poloha: " + position[0].lat.toFixed(6) + ", " + position[0].lon.toFixed(6);
                log += " nebo " + position[1].lat.toFixed(6) + ", " + position[1].lon.toFixed(6) + "<br>";
            }
            else
            {
                log += "Poloha: " + position.lat.toFixed(6) + ", " + position.lon.toFixed(6) + "<br>";
            }
        }
        else
        {
            log += "Poloha nezjištěna." + "<br>";
        }

        if (gps != null)
        {
            log += "GPS poloha: " + gps.lat + ", " + gps.lon + "<br>";
        }
        else
        {
            log += "GPS poloha nezjištěna." + "<br>";
        }
    }
    else
    {
        log += "Poloha neznámá." + "<br>";
    }

    $("#info").html(log);
}