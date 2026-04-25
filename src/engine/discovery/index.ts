export { MDNSDiscovery, type MDNSServiceInfo, type MDNSCallbacks } from './mdns.js';
export { TailscaleDiscovery, type TailscaleStatus } from './tailscale.js';
export {
	resolveBestDiscoveryRoute,
	scoreDiscoveryRouteCandidate,
	createCandidateFromMdns,
	createCandidatesFromTailscalePeers,
	type DiscoveryRoute,
	type DiscoveryRouteCandidate,
} from './routing.js';
