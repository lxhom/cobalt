import { genericUserAgent } from "../../config.js";

function bestQuality(arr) {
    return arr.filter((v) => { if (v["content_type"] === "video/mp4") return true }).sort((a, b) => Number(b.bitrate) - Number(a.bitrate))[0]["url"].split("?")[0]
}
const apiURL = "https://api.twitter.com/1.1"

// TO-DO: move from 1.1 api to graphql
export default async function(obj) {
    let _headers = {
        "user-agent": genericUserAgent,
        "authorization": "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
        // ^ no explicit content, but with multi media support
        "host": "api.twitter.com"
    };
    let req_act = await fetch(`${apiURL}/guest/activate.json`, {
        method: "POST",
        headers: _headers
    }).then((r) => { return r.status === 200 ? r.json() : false }).catch(() => { return false });
    if (!req_act) return { error: 'ErrorCouldntFetch' };

    _headers["x-guest-token"] = req_act["guest_token"];
    let showURL = `${apiURL}/statuses/show/${obj.id}.json?tweet_mode=extended&include_user_entities=0&trim_user=1&include_entities=0&cards_platform=Web-12&include_cards=1`;

    if (!obj.spaceId) {
        let req_status = await fetch(showURL, { headers: _headers }).then((r) => { return r.status === 200 ? r.json() : false }).catch((e) => { return false });
        if (!req_status) {
            _headers.authorization = "Bearer AAAAAAAAAAAAAAAAAAAAAPYXBAAAAAAACLXUNDekMxqa8h%2F40K4moUkGsoc%3DTYfbDKbT3jJPCEVnMYqilB28NHfOPqkca3qaAxGfsyKCs0wRbw";
            // ^ explicit content, but no multi media support
            delete _headers["x-guest-token"]

            req_act = await fetch(`${apiURL}/guest/activate.json`, {
                method: "POST",
                headers: _headers
            }).then((r) => { return r.status === 200 ? r.json() : false}).catch(() => { return false });
            if (!req_act) return { error: 'ErrorCouldntFetch' };

            _headers["x-guest-token"] = req_act["guest_token"];
            req_status = await fetch(showURL, { headers: _headers }).then((r) => { return r.status === 200 ? r.json() : false }).catch(() => { return false });
        }
        if (!req_status) return { error: 'ErrorCouldntFetch' };

        let baseStatus;
        if (req_status["extended_entities"] && req_status["extended_entities"]["media"]) {
            baseStatus = req_status["extended_entities"]
        } else if (req_status["retweeted_status"] && req_status["retweeted_status"]["extended_entities"] && req_status["retweeted_status"]["extended_entities"]["media"]) {
            baseStatus = req_status["retweeted_status"]["extended_entities"]
        }
        if (!baseStatus) return { error: 'ErrorNoVideosInTweet' };

        let single, multiple = [], media = baseStatus["media"];
        media = media.filter((i) => { if (i["type"] === "video" || i["type"] === "animated_gif") return true })
        if (media.length > 1) {
            for (let i in media) { multiple.push({type: "video", thumb: media[i]["media_url_https"], url: bestQuality(media[i]["video_info"]["variants"])}) }
        } else if (media.length === 1) {
            single = bestQuality(media[0]["video_info"]["variants"])
        } else {
            return { error: 'ErrorNoVideosInTweet' }
        }

        if (single) {
            return { urls: single, filename: `twitter_${obj.id}.mp4`, audioFilename: `twitter_${obj.id}_audio` }
        } else if (multiple) {
            return { picker: multiple }
        } else {
            return { error: 'ErrorNoVideosInTweet' }
        }
    } else {
        _headers["host"] = "twitter.com";
        _headers["content-type"] = "application/json";

        let query = {
            variables: {"id": obj.spaceId,"isMetatagsQuery":true,"withDownvotePerspective":false,"withReactionsMetadata":false,"withReactionsPerspective":false,"withReplays":true},
            features: {"spaces_2022_h2_clipping":true,"spaces_2022_h2_spaces_communities":true,"responsive_web_twitter_blue_verified_badge_is_enabled":true,"responsive_web_graphql_exclude_directive_enabled":true,"verified_phone_label_enabled":false,"responsive_web_graphql_skip_user_profile_image_extensions_enabled":false,"tweetypie_unmention_optimization_enabled":true,"vibe_api_enabled":true,"responsive_web_edit_tweet_api_enabled":true,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,"longform_notetweets_consumption_enabled":true,"tweet_awards_web_tipping_enabled":false,"freedom_of_speech_not_reach_fetch_enabled":false,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":false,"responsive_web_graphql_timeline_navigation_enabled":true,"interactive_text_enabled":true,"responsive_web_text_conversations_enabled":false,"longform_notetweets_richtext_consumption_enabled":false,"responsive_web_enhance_cards_enabled":false}
        }
        query.variables = new URLSearchParams(JSON.stringify(query.variables)).toString().slice(0, -1);
        query.features = new URLSearchParams(JSON.stringify(query.features)).toString().slice(0, -1);
        query = `https://twitter.com/i/api/graphql/Gdz2uCtmIGMmhjhHG3V7nA/AudioSpaceById?variables=${query.variables}&features=${query.features}`;

        let AudioSpaceById = await fetch(query, { headers: _headers }).then((r) => {return r.status === 200 ? r.json() : false}).catch((e) => { return false });
        if (!AudioSpaceById) return { error: 'ErrorEmptyDownload' };

        if (!AudioSpaceById.data.audioSpace.metadata) return { error: 'ErrorEmptyDownload' };
        if (AudioSpaceById.data.audioSpace.metadata.is_space_available_for_replay !== true) return { error: 'TwitterSpaceWasntRecorded' };

        let streamStatus = await fetch(
            `https://twitter.com/i/api/1.1/live_video_stream/status/${AudioSpaceById.data.audioSpace.metadata.media_key}`, { headers: _headers }
        ).then((r) =>{ return r.status === 200 ? r.json() : false }).catch(() => { return false });
        if (!streamStatus) return { error: 'ErrorCouldntFetch' };

        let participants = AudioSpaceById.data.audioSpace.participants.speakers,
            listOfParticipants = `Twitter Space speakers: `;
        for (let i in participants) { listOfParticipants += `@${participants[i]["twitter_screen_name"]}, ` }
        listOfParticipants = listOfParticipants.slice(0, -2);

        return {
            urls: streamStatus.source.noRedirectPlaybackUrl,
            audioFilename: `twitterspaces_${obj.spaceId}`,
            isAudioOnly: true,
            fileMetadata: {
                title: AudioSpaceById.data.audioSpace.metadata.title,
                artist: `Twitter Space by @${AudioSpaceById.data.audioSpace.metadata.creator_results.result.legacy.screen_name}`,
                comment: listOfParticipants,
                // cover: AudioSpaceById.data.audioSpace.metadata.creator_results.result.legacy.profile_image_url_https.replace("_normal", "")
            }
        }
    }
}
